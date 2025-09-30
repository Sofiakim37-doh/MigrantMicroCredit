;; LoanManager.clar - Core Micro-Credit Loan Management Contract
;; This contract manages the lifecycle of micro-loans for migrant startups on Stacks.
;; It integrates with other contracts like MigrantRegistry, CreditScorer, LiquidityPool, and Governance.
;; Features include loan requests, approvals, disbursements, interest calculations, partial repayments,
;; default handling, and governance-controlled parameters.

;; Constants
(define-constant ERR-UNAUTHORIZED (err u1000))
(define-constant ERR-LOW-SCORE (err u3000))
(define-constant ERR-INSUFFICIENT-POOL (err u3001))
(define-constant ERR-LOAN-NOT-FOUND (err u3002))
(define-constant ERR-LOAN-ALREADY-APPROVED (err u3003))
(define-constant ERR-LOAN-NOT-APPROVED (err u3004))
(define-constant ERR-LOAN-ALREADY-DISBURSED (err u3005))
(define-constant ERR-INVALID-AMOUNT (err u3006))
(define-constant ERR-INVALID-DURATION (err u3007))
(define-constant ERR-LOAN-DEFAULTED (err u3008))
(define-constant ERR-REPAYMENT-EXCEEDS-DUE (err u3009))
(define-constant ERR-GRACE-PERIOD-NOT-OVER (err u3010))
(define-constant MIN-LOAN u50) ;; Minimum loan amount in micro-STX
(define-constant MAX-LOAN u500000) ;; Maximum loan amount in micro-STX (e.g., $500 equivalent)
(define-constant MIN-DURATION u1440) ;; Minimum duration in blocks (~10 days at 10min/block)
(define-constant MAX-DURATION u52560) ;; Maximum duration in blocks (~1 year)
(define-constant BASIS-POINTS u10000) ;; For interest rate calculations
(define-constant DEFAULT-INTEREST u500) ;; 5% in basis points
(define-constant PENALTY-INTEREST u200) ;; 2% penalty in basis points
(define-constant GRACE-PERIOD u144) ;; 1 day grace period in blocks

;; Data Variables
(define-data-var admin principal tx-sender)
(define-data-var min-score uint u600) ;; Minimum credit score required
(define-data-var max-interest uint u1200) ;; Max interest 12%
(define-data-var loan-counter uint u0)
(define-data-var total-loans-issued uint u0)
(define-data-var total-loans-repaid uint u0)
(define-data-var total-defaulted uint u0)

;; Data Maps
(define-map loans
  uint
  {
    borrower: principal,
    amount: uint,
    interest: uint, ;; Basis points
    duration: uint, ;; In blocks
    start-block: uint,
    approved: bool,
    disbursed: bool,
    repaid: bool,
    defaulted: bool,
    outstanding: uint,
    total-due: uint,
    repayments-made: uint ;; Number of partial repayments
  }
)

(define-map loan-repayments
  { loan-id: uint, repayment-id: uint }
  {
    amount: uint,
    timestamp: uint,
    block-height: uint
  }
)

;; Private Functions
(define-private (calculate-total-due (amount uint) (interest uint) (duration uint))
  (+ amount (/ (* amount interest duration) (* BASIS-POINTS MAX-DURATION)))) ;; Simplified linear interest

(define-private (is-gov-member (caller principal))
  ;; Mock cross-call to Governance; in production, use contract-call?
  (is-eq caller (var-get admin))) ;; Placeholder for actual governance check

(define-private (get-score (borrower principal))
  ;; Mock cross-call to CreditScorer
  (ok { score: u700 })) ;; Placeholder; actual: (contract-call? .credit-scorer get-score borrower)

(define-private (is-verified-migrant (borrower principal))
  ;; Mock cross-call to MigrantRegistry
  true) ;; Placeholder; actual: (is-some (contract-call? .migrant-registry get-migrant borrower))

(define-private (transfer-from-pool (to principal) (amount uint))
  ;; Mock cross-call to LiquidityPool
  (ok true)) ;; Placeholder; actual: (contract-call? .liquidity-pool transfer-funds to amount)

(define-private (distribute-penalty (loan-id uint) (penalty uint))
  ;; Mock: distribute penalty to pool or governance
  (ok true))

;; Public Functions
(define-public (request-loan (amount uint) (duration uint))
  (let (
    (caller tx-sender)
    (verified (is-verified-migrant caller))
    (score-response (unwrap! (get-score caller) ERR-LOW-SCORE))
    (score (get score score-response))
    (loan-id (+ (var-get loan-counter) u1))
    (total-due (calculate-total-due amount DEFAULT-INTEREST duration))
  )
    (asserts! verified ERR-UNAUTHORIZED)
    (asserts! (>= score (var-get min-score)) ERR-LOW-SCORE)
    (asserts! (and (>= amount MIN-LOAN) (<= amount MAX-LOAN)) ERR-INVALID-AMOUNT)
    (asserts! (and (>= duration MIN-DURATION) (<= duration MAX-DURATION)) ERR-INVALID-DURATION)
    (map-insert loans loan-id
      {
        borrower: caller,
        amount: amount,
        interest: DEFAULT-INTEREST,
        duration: duration,
        start-block: u0, ;; Set on disbursement
        approved: false,
        disbursed: false,
        repaid: false,
        defaulted: false,
        outstanding: total-due,
        total-due: total-due,
        repayments-made: u0
      }
    )
    (var-set loan-counter loan-id)
    (print { event: "loan_requested", loan-id: loan-id, borrower: caller, amount: amount })
    (ok loan-id)
  )
)

(define-public (approve-loan (loan-id uint) (custom-interest uint))
  (let (
    (loan (unwrap! (map-get? loans loan-id) ERR-LOAN-NOT-FOUND))
  )
    (asserts! (is-gov-member tx-sender) ERR-UNAUTHORIZED)
    (asserts! (not (get approved loan)) ERR-LOAN-ALREADY-APPROVED)
    (asserts! (<= custom-interest (var-get max-interest)) ERR-INVALID-AMOUNT)
    (map-set loans loan-id
      (merge loan
        {
          approved: true,
          interest: (if (> custom-interest u0) custom-interest (get interest loan))
        }
      )
    )
    (print { event: "loan_approved", loan-id: loan-id })
    (ok true)
  )
)

(define-public (disburse-loan (loan-id uint))
  (let (
    (loan (unwrap! (map-get? loans loan-id) ERR-LOAN-NOT-FOUND))
    (borrower (get borrower loan))
  )
    (asserts! (get approved loan) ERR-LOAN-NOT-APPROVED)
    (asserts! (not (get disbursed loan)) ERR-LOAN-ALREADY-DISBURSED)
    (try! (transfer-from-pool borrower (get amount loan)))
    (map-set loans loan-id
      (merge loan
        {
          disbursed: true,
          start-block: block-height
        }
      )
    )
    (var-set total-loans-issued (+ (var-get total-loans-issued) u1))
    (print { event: "loan_disbursed", loan-id: loan-id, amount: (get amount loan) })
    (ok true)
  )
)

(define-public (repay-loan (loan-id uint) (repay-amount uint))
  (let (
    (loan (unwrap! (map-get? loans loan-id) ERR-LOAN-NOT-FOUND))
    (caller tx-sender)
    (repayment-id (+ (get repayments-made loan) u1))
    (outstanding (get outstanding loan))
  )
    (asserts! (is-eq caller (get borrower loan)) ERR-UNAUTHORIZED)
    (asserts! (get disbursed loan) ERR-LOAN-NOT-APPROVED)
    (asserts! (not (get repaid loan)) ERR-LOAN-ALREADY-APPROVED)
    (asserts! (not (get defaulted loan)) ERR-LOAN-DEFAULTED)
    (asserts! (> repay-amount u0) ERR-INVALID-AMOUNT)
    (asserts! (<= repay-amount outstanding) ERR-REPAYMENT-EXCEEDS-DUE)
    ;; Transfer STX to contract (placeholder; actual stx-transfer?)
    (as-contract (ok true))
    (map-set loan-repayments { loan-id: loan-id, repayment-id: repayment-id }
      {
        amount: repay-amount,
        timestamp: block-height,
        block-height: block-height
      }
    )
    (let (
      (new-outstanding (- outstanding repay-amount))
      (new-loan (merge loan
        {
          outstanding: new-outstanding,
          repayments-made: repayment-id
        }
      ))
    )
      (map-set loans loan-id new-loan)
      (if (is-eq new-outstanding u0)
        (begin
          (map-set loans loan-id (merge new-loan { repaid: true }))
          (var-set total-loans-repaid (+ (var-get total-loans-repaid) u1))
          (print { event: "loan_repaid", loan-id: loan-id })
        )
        (print { event: "partial_repayment", loan-id: loan-id, amount: repay-amount })
      )
      (ok repay-amount)
    )
  )
)

(define-public (check-default (loan-id uint))
  (let (
    (loan (unwrap! (map-get? loans loan-id) ERR-LOAN-NOT-FOUND))
    (end-block (+ (get start-block loan) (get duration loan)))
    (current-block block-height)
  )
    (asserts! (> current-block (+ end-block GRACE-PERIOD)) ERR-GRACE-PERIOD-NOT-OVER)
    (asserts! (not (get defaulted loan)) ERR-LOAN-DEFAULTED)
    (asserts! (not (get repaid loan)) ERR-LOAN-ALREADY-APPROVED)
    (let (
      (penalty (/ (* (get outstanding loan) PENALTY-INTEREST) BASIS-POINTS))
    )
      (try! (distribute-penalty loan-id penalty))
      (map-set loans loan-id (merge loan { defaulted: true, outstanding: (+ (get outstanding loan) penalty) }))
      (var-set total-defaulted (+ (var-get total-defaulted) u1))
      (print { event: "loan_defaulted", loan-id: loan-id })
      (ok true)
    )
  )
)

(define-public (update-min-score (new-score uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-UNAUTHORIZED)
    (var-set min-score new-score)
    (ok new-score)
  )
)

(define-public (update-max-interest (new-interest uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-UNAUTHORIZED)
    (var-set max-interest new-interest)
    (ok new-interest)
  )
)

;; Read-Only Functions
(define-read-only (get-loan (loan-id uint))
  (map-get? loans loan-id)
)

(define-read-only (get-loan-repayment (loan-id uint) (repayment-id uint))
  (map-get? loan-repayments { loan-id: loan-id, repayment-id: repayment-id })
)

(define-read-only (get-min-score)
  (var-get min-score)
)

(define-read-only (get-total-loans-issued)
  (var-get total-loans-issued)
)

(define-read-only (get-total-loans-repaid)
  (var-get total-loans-repaid)
)

(define-read-only (get-total-defaulted)
  (var-get total-defaulted)
)