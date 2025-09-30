import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface LoanRecord {
  borrower: string;
  amount: number;
  interest: number;
  duration: number;
  startBlock: number;
  approved: boolean;
  disbursed: boolean;
  repaid: boolean;
  defaulted: boolean;
  outstanding: number;
  totalDue: number;
  repaymentsMade: number;
}

interface RepaymentRecord {
  amount: number;
  timestamp: number;
  blockHeight: number;
}

interface ContractState {
  loans: Map<number, LoanRecord>;
  loanRepayments: Map<string, RepaymentRecord>; // Key as `${loanId}-${repaymentId}`
  loanCounter: number;
  totalLoansIssued: number;
  totalLoansRepaid: number;
  totalDefaulted: number;
  minScore: number;
  maxInterest: number;
  admin: string;
  currentBlock: number; // Simulated block height
}

// Mock contract implementation
class LoanManagerMock {
  private state: ContractState = {
    loans: new Map(),
    loanRepayments: new Map(),
    loanCounter: 0,
    totalLoansIssued: 0,
    totalLoansRepaid: 0,
    totalDefaulted: 0,
    minScore: 600,
    maxInterest: 1200,
    admin: "deployer",
    currentBlock: 1000, // Starting block
  };

  private MIN_LOAN = 50;
  private MAX_LOAN = 500000;
  private MIN_DURATION = 1440;
  private MAX_DURATION = 52560;
  private BASIS_POINTS = 10000;
  private DEFAULT_INTEREST = 500;
  private PENALTY_INTEREST = 200;
  private GRACE_PERIOD = 144;

  private ERR_UNAUTHORIZED = 1000;
  private ERR_LOW_SCORE = 3000;
  private ERR_LOAN_NOT_FOUND = 3002;
  private ERR_LOAN_ALREADY_APPROVED = 3003;
  private ERR_LOAN_NOT_APPROVED = 3004;
  private ERR_LOAN_ALREADY_DISBURSED = 3005;
  private ERR_INVALID_AMOUNT = 3006;
  private ERR_INVALID_DURATION = 3007;
  private ERR_LOAN_DEFAULTED = 3008;
  private ERR_REPAYMENT_EXCEEDS_DUE = 3009;
  private ERR_GRACE_PERIOD_NOT_OVER = 3010;

  // Simulate block advancement
  advanceBlock(blocks: number): void {
    this.state.currentBlock += blocks;
  }

  private calculateTotalDue(amount: number, interest: number, duration: number): number {
    return amount + (amount * interest * duration) / (this.BASIS_POINTS * this.MAX_DURATION);
  }

  private isGovMember(caller: string): boolean {
    return caller === this.state.admin; // Placeholder
  }

  public getScore(borrower: string): ClarityResponse<{ score: number }> {
    return { ok: true, value: { score: 700 } }; // Mock high score
  }

  private isVerifiedMigrant(borrower: string): boolean {
    return true; // Mock
  }

  requestLoan(caller: string, amount: number, duration: number): ClarityResponse<number> {
    if (!this.isVerifiedMigrant(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const scoreResponse = this.getScore(caller);
    if (!scoreResponse.ok) {
      return { ok: false, value: this.ERR_LOW_SCORE };
    }
    const score = (scoreResponse.value as { score: number }).score;
    if (score < this.state.minScore) {
      return { ok: false, value: this.ERR_LOW_SCORE };
    }
    if (amount < this.MIN_LOAN || amount > this.MAX_LOAN) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (duration < this.MIN_DURATION || duration > this.MAX_DURATION) {
      return { ok: false, value: this.ERR_INVALID_DURATION };
    }
    const loanId = this.state.loanCounter + 1;
    const totalDue = this.calculateTotalDue(amount, this.DEFAULT_INTEREST, duration);
    this.state.loans.set(loanId, {
      borrower: caller,
      amount,
      interest: this.DEFAULT_INTEREST,
      duration,
      startBlock: 0,
      approved: false,
      disbursed: false,
      repaid: false,
      defaulted: false,
      outstanding: totalDue,
      totalDue,
      repaymentsMade: 0,
    });
    this.state.loanCounter = loanId;
    return { ok: true, value: loanId };
  }

  approveLoan(caller: string, loanId: number, customInterest: number): ClarityResponse<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: false, value: this.ERR_LOAN_NOT_FOUND };
    }
    if (!this.isGovMember(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (loan.approved) {
      return { ok: false, value: this.ERR_LOAN_ALREADY_APPROVED };
    }
    if (customInterest > this.state.maxInterest) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const newInterest = customInterest > 0 ? customInterest : loan.interest;
    this.state.loans.set(loanId, { ...loan, approved: true, interest: newInterest });
    return { ok: true, value: true };
  }

  disburseLoan(loanId: number): ClarityResponse<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: false, value: this.ERR_LOAN_NOT_FOUND };
    }
    if (!loan.approved) {
      return { ok: false, value: this.ERR_LOAN_NOT_APPROVED };
    }
    if (loan.disbursed) {
      return { ok: false, value: this.ERR_LOAN_ALREADY_DISBURSED };
    }
    // Simulate pool transfer success
    this.state.loans.set(loanId, { ...loan, disbursed: true, startBlock: this.state.currentBlock });
    this.state.totalLoansIssued += 1;
    return { ok: true, value: true };
  }

  repayLoan(caller: string, loanId: number, repayAmount: number): ClarityResponse<number> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: false, value: this.ERR_LOAN_NOT_FOUND };
    }
    if (caller !== loan.borrower) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!loan.disbursed) {
      return { ok: false, value: this.ERR_LOAN_NOT_APPROVED };
    }
    if (loan.repaid) {
      return { ok: false, value: this.ERR_LOAN_ALREADY_APPROVED };
    }
    if (loan.defaulted) {
      return { ok: false, value: this.ERR_LOAN_DEFAULTED };
    }
    if (repayAmount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (repayAmount > loan.outstanding) {
      return { ok: false, value: this.ERR_REPAYMENT_EXCEEDS_DUE };
    }
    const repaymentId = loan.repaymentsMade + 1;
    const key = `${loanId}-${repaymentId}`;
    this.state.loanRepayments.set(key, {
      amount: repayAmount,
      timestamp: this.state.currentBlock,
      blockHeight: this.state.currentBlock,
    });
    const newOutstanding = loan.outstanding - repayAmount;
    const newLoan = { ...loan, outstanding: newOutstanding, repaymentsMade: repaymentId };
    if (newOutstanding === 0) {
      this.state.loans.set(loanId, { ...newLoan, repaid: true });
      this.state.totalLoansRepaid += 1;
    } else {
      this.state.loans.set(loanId, newLoan);
    }
    return { ok: true, value: repayAmount };
  }

  checkDefault(loanId: number): ClarityResponse<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: false, value: this.ERR_LOAN_NOT_FOUND };
    }
    const endBlock = loan.startBlock + loan.duration;
    if (this.state.currentBlock <= endBlock + this.GRACE_PERIOD) {
      return { ok: false, value: this.ERR_GRACE_PERIOD_NOT_OVER };
    }
    if (loan.defaulted) {
      return { ok: false, value: this.ERR_LOAN_DEFAULTED };
    }
    if (loan.repaid) {
      return { ok: false, value: this.ERR_LOAN_ALREADY_APPROVED };
    }
    const penalty = (loan.outstanding * this.PENALTY_INTEREST) / this.BASIS_POINTS;
    // Simulate distribute penalty
    this.state.loans.set(loanId, { ...loan, defaulted: true, outstanding: loan.outstanding + penalty });
    this.state.totalDefaulted += 1;
    return { ok: true, value: true };
  }

  updateMinScore(caller: string, newScore: number): ClarityResponse<number> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.minScore = newScore;
    return { ok: true, value: newScore };
  }

  updateMaxInterest(caller: string, newInterest: number): ClarityResponse<number> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.maxInterest = newInterest;
    return { ok: true, value: newInterest };
  }

  getLoan(loanId: number): ClarityResponse<LoanRecord | undefined> {
    return { ok: true, value: this.state.loans.get(loanId) };
  }

  getLoanRepayment(loanId: number, repaymentId: number): ClarityResponse<RepaymentRecord | undefined> {
    const key = `${loanId}-${repaymentId}`;
    return { ok: true, value: this.state.loanRepayments.get(key) };
  }

  getMinScore(): ClarityResponse<number> {
    return { ok: true, value: this.state.minScore };
  }

  getTotalLoansIssued(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalLoansIssued };
  }

  getTotalLoansRepaid(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalLoansRepaid };
  }

  getTotalDefaulted(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalDefaulted };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  borrower: "wallet_1",
  govMember: "deployer", // Same as admin
  unauthorized: "wallet_2",
};

describe("LoanManager Contract", () => {
  let contract: LoanManagerMock;

  beforeEach(() => {
    contract = new LoanManagerMock();
  });

  it("should allow verified borrower to request a loan", () => {
    const result = contract.requestLoan(accounts.borrower, 1000, 1440);
    expect(result).toEqual({ ok: true, value: 1 });
    const loan = contract.getLoan(1);
    expect(loan.ok).toBe(true);
    expect((loan.value as LoanRecord).borrower).toBe(accounts.borrower);
    expect((loan.value as LoanRecord).amount).toBe(1000);
  });

  it("should prevent unauthorized user from requesting loan with low score", () => {
    // Simulate low score by overriding getScore
    contract.getScore = () => ({ ok: true, value: { score: 500 } });
    const result = contract.requestLoan(accounts.unauthorized, 1000, 1440);
    expect(result).toEqual({ ok: false, value: 3000 });
  });

  it("should allow governance to approve loan", () => {
    contract.requestLoan(accounts.borrower, 1000, 1440);
    const result = contract.approveLoan(accounts.govMember, 1, 600);
    expect(result).toEqual({ ok: true, value: true });
    const loan = contract.getLoan(1);
    expect((loan.value as LoanRecord).approved).toBe(true);
    expect((loan.value as LoanRecord).interest).toBe(600);
  });

  it("should prevent non-gov from approving loan", () => {
    contract.requestLoan(accounts.borrower, 1000, 1440);
    const result = contract.approveLoan(accounts.unauthorized, 1, 600);
    expect(result).toEqual({ ok: false, value: 1000 });
  });

  it("should disburse approved loan", () => {
    contract.requestLoan(accounts.borrower, 1000, 1440);
    contract.approveLoan(accounts.govMember, 1, 0);
    const result = contract.disburseLoan(1);
    expect(result).toEqual({ ok: true, value: true });
    const loan = contract.getLoan(1);
    expect((loan.value as LoanRecord).disbursed).toBe(true);
    expect((loan.value as LoanRecord).startBlock).toBe(1000);
    expect(contract.getTotalLoansIssued()).toEqual({ ok: true, value: 1 });
  });

  it("should allow partial repayment", () => {
    contract.requestLoan(accounts.borrower, 1000, 1440);
    contract.approveLoan(accounts.govMember, 1, 0);
    contract.disburseLoan(1);
    const result = contract.repayLoan(accounts.borrower, 1, 500);
    expect(result).toEqual({ ok: true, value: 500 });
    const loan = contract.getLoan(1);
    expect((loan.value as LoanRecord).outstanding).toBeLessThan((loan.value as LoanRecord).totalDue ?? 0);
    expect((loan.value as LoanRecord).repaymentsMade).toBe(1);
    const repayment = contract.getLoanRepayment(1, 1);
    expect((repayment.value as RepaymentRecord).amount).toBe(500);
  });

  it("should detect default after grace period", () => {
    contract.requestLoan(accounts.borrower, 1000, 1440);
    contract.approveLoan(accounts.govMember, 1, 0);
    contract.disburseLoan(1);
    contract.advanceBlock(1440 + 144 + 1); // Past duration + grace
    const result = contract.checkDefault(1);
    expect(result).toEqual({ ok: true, value: true });
    const loan = contract.getLoan(1);
    expect((loan.value as LoanRecord).defaulted).toBe(true);
    expect((loan.value as LoanRecord).outstanding).toBeGreaterThan((loan.value as LoanRecord).totalDue ?? 0);
    expect(contract.getTotalDefaulted()).toEqual({ ok: true, value: 1 });
  });

  it("should allow admin to update min score", () => {
    const result = contract.updateMinScore(accounts.deployer, 700);
    expect(result).toEqual({ ok: true, value: 700 });
    expect(contract.getMinScore()).toEqual({ ok: true, value: 700 });
  });

  it("should prevent non-admin from updating max interest", () => {
    const result = contract.updateMaxInterest(accounts.unauthorized, 1500);
    expect(result).toEqual({ ok: false, value: 1000 });
  });
});