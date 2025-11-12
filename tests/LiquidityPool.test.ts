import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INSUFFICIENT_BALANCE = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_POOL_PAUSED = 103;
const ERR_INVALID_ASSET = 104;
const ERR_CLAIM_NOT_READY = 105;
const ERR_INVALID_TIMESTAMP = 106;
const ERR_INVALID_YIELD_RATE = 107;
const ERR_INVALID_LOCK_PERIOD = 108;
const ERR_MAX_ASSETS_EXCEEDED = 109;
const ERR_INVALID_PENALTY_RATE = 110;
const ERR_INVALID_GOV_THRESHOLD = 111;
const ERR_ASSET_ALREADY_EXISTS = 112;
const ERR_ASSET_NOT_FOUND = 113;
const ERR_INVALID_UPDATE_PARAM = 114;
const ERR_UPDATE_NOT_ALLOWED = 115;
const ERR_INVALID_STATUS = 116;
const ERR_INVALID_LOCATION = 117;
const ERR_INVALID_CURRENCY = 118;
const ERR_INVALID_MIN_DEPOSIT = 119;
const ERR_INVALID_MAX_DEPOSIT = 120;

interface Asset {
  symbol: string;
  minDeposit: bigint;
  maxDeposit: bigint;
  yieldRate: bigint;
  lockPeriod: bigint;
  penaltyRate: bigint;
  govThreshold: bigint;
  timestamp: bigint;
  creator: string;
  status: boolean;
  location: string;
  currency: string;
}

interface PoolState {
  staked: bigint;
  yieldAccrued: bigint;
  lastDepositTime: bigint;
  lockedUntil: bigint;
}

interface AssetUpdate {
  updateSymbol: string;
  updateMinDeposit: bigint;
  updateMaxDeposit: bigint;
  updateTimestamp: bigint;
  updater: string;
}

interface Result<T> {
  isOk: boolean;
  value: T | number;
}

class LiquidityPoolMock {
  state: {
    nextAssetId: bigint;
    maxAssets: bigint;
    poolFee: bigint;
    authorityContract: string | null;
    poolPaused: boolean;
    assets: Map<bigint, Asset>;
    assetUpdates: Map<bigint, AssetUpdate>;
    assetsBySymbol: Map<string, bigint>;
    poolStates: Map<string, PoolState>;
  } = {
    nextAssetId: 0n,
    maxAssets: 10n,
    poolFee: 500n,
    authorityContract: null,
    poolPaused: false,
    assets: new Map(),
    assetUpdates: new Map(),
    assetsBySymbol: new Map(),
    poolStates: new Map(),
  };
  blockHeight: bigint = 0n;
  caller: string = "ST1TEST";
  stxBalances: Map<string, bigint> = new Map([["ST1TEST", 1000000n]]);
  lpTokenBalances: Map<string, bigint> = new Map();
  stxTransfers: Array<{ amount: bigint; from: string; to: string }> = [];
  ftMints: Array<{ amount: bigint; to: string }> = [];
  ftBurns: Array<{ amount: bigint; from: string }> = [];
  events: Array<{ event: string; [key: string]: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextAssetId: 0n,
      maxAssets: 10n,
      poolFee: 500n,
      authorityContract: null,
      poolPaused: false,
      assets: new Map(),
      assetUpdates: new Map(),
      assetsBySymbol: new Map(),
      poolStates: new Map(),
    };
    this.blockHeight = 0n;
    this.caller = "ST1TEST";
    this.stxBalances.set("ST1TEST", 1000000n);
    this.lpTokenBalances = new Map();
    this.stxTransfers = [];
    this.ftMints = [];
    this.ftBurns = [];
    this.events = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.state.authorityContract !== null) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.authorityContract = contractPrincipal;
    return { isOk: true, value: true };
  }

  setMaxAssets(newMax: bigint): Result<boolean> {
    if (newMax <= 0n) {
      return { isOk: false, value: ERR_INVALID_UPDATE_PARAM };
    }
    if (this.state.authorityContract === null) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.maxAssets = newMax;
    return { isOk: true, value: true };
  }

  setPoolFee(newFee: bigint): Result<boolean> {
    if (newFee < 0n) {
      return { isOk: false, value: ERR_INVALID_UPDATE_PARAM };
    }
    if (this.state.authorityContract === null) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.poolFee = newFee;
    return { isOk: true, value: true };
  }

  pausePool(paused: boolean): Result<boolean> {
    if (this.state.authorityContract === null) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.poolPaused = paused;
    return { isOk: true, value: true };
  }

  addAsset(
    symbol: string,
    minDeposit: bigint,
    maxDeposit: bigint,
    yieldRate: bigint,
    lockPeriod: bigint,
    penaltyRate: bigint,
    govThreshold: bigint,
    location: string,
    currency: string
  ): Result<bigint> {
    if (this.state.nextAssetId >= this.state.maxAssets) {
      return { isOk: false, value: ERR_MAX_ASSETS_EXCEEDED };
    }
    if (!symbol || symbol.length > 20) {
      return { isOk: false, value: ERR_INVALID_UPDATE_PARAM };
    }
    if (minDeposit <= 0n) {
      return { isOk: false, value: ERR_INVALID_MIN_DEPOSIT };
    }
    if (maxDeposit <= 0n) {
      return { isOk: false, value: ERR_INVALID_MAX_DEPOSIT };
    }
    if (yieldRate > 1000n) {
      return { isOk: false, value: ERR_INVALID_YIELD_RATE };
    }
    if (lockPeriod <= 0n) {
      return { isOk: false, value: ERR_INVALID_LOCK_PERIOD };
    }
    if (penaltyRate > 500n) {
      return { isOk: false, value: ERR_INVALID_PENALTY_RATE };
    }
    if (govThreshold <= 0n || govThreshold > 100n) {
      return { isOk: false, value: ERR_INVALID_GOV_THRESHOLD };
    }
    if (!location || location.length > 100) {
      return { isOk: false, value: ERR_INVALID_LOCATION };
    }
    if (!["STX", "USD", "BTC"].includes(currency)) {
      return { isOk: false, value: ERR_INVALID_CURRENCY };
    }
    if (this.state.assetsBySymbol.has(symbol)) {
      return { isOk: false, value: ERR_ASSET_ALREADY_EXISTS };
    }
    if (this.state.authorityContract === null) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    const authority = this.state.authorityContract;
    this.stxTransfers.push({ amount: this.state.poolFee, from: this.caller, to: authority });
    const id = this.state.nextAssetId;
    const asset: Asset = {
      symbol,
      minDeposit,
      maxDeposit,
      yieldRate,
      lockPeriod,
      penaltyRate,
      govThreshold,
      timestamp: this.blockHeight,
      creator: this.caller,
      status: true,
      location,
      currency,
    };
    this.state.assets.set(id, asset);
    this.state.assetsBySymbol.set(symbol, id);
    this.state.nextAssetId += 1n;
    this.events.push({ event: "asset-added", id });
    return { isOk: true, value: id };
  }

  updateAsset(id: bigint, updateSymbol: string, updateMinDeposit: bigint, updateMaxDeposit: bigint): Result<boolean> {
    const asset = this.state.assets.get(id);
    if (!asset) {
      return { isOk: false, value: ERR_ASSET_NOT_FOUND };
    }
    if (asset.creator !== this.caller) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    if (!updateSymbol || updateSymbol.length > 20) {
      return { isOk: false, value: ERR_INVALID_UPDATE_PARAM };
    }
    if (updateMinDeposit <= 0n) {
      return { isOk: false, value: ERR_INVALID_MIN_DEPOSIT };
    }
    if (updateMaxDeposit <= 0n) {
      return { isOk: false, value: ERR_INVALID_MAX_DEPOSIT };
    }
    if (this.state.assetsBySymbol.has(updateSymbol) && this.state.assetsBySymbol.get(updateSymbol) !== id) {
      return { isOk: false, value: ERR_ASSET_ALREADY_EXISTS };
    }
    const updated: Asset = {
      ...asset,
      symbol: updateSymbol,
      minDeposit: updateMinDeposit,
      maxDeposit: updateMaxDeposit,
      timestamp: this.blockHeight,
    };
    this.state.assets.set(id, updated);
    this.state.assetsBySymbol.delete(asset.symbol);
    this.state.assetsBySymbol.set(updateSymbol, id);
    this.state.assetUpdates.set(id, {
      updateSymbol,
      updateMinDeposit,
      updateMaxDeposit,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    this.events.push({ event: "asset-updated", id });
    return { isOk: true, value: true };
  }

  addLiquidity(assetId: bigint, amount: bigint): Result<boolean> {
    const asset = this.state.assets.get(assetId);
    if (!asset) {
      return { isOk: false, value: ERR_ASSET_NOT_FOUND };
    }
    if (this.state.poolPaused) {
      return { isOk: false, value: ERR_POOL_PAUSED };
    }
    if (amount < asset.minDeposit || amount > asset.maxDeposit) {
      return { isOk: false, value: ERR_INVALID_AMOUNT };
    }
    const callerBalance = this.stxBalances.get(this.caller) || 0n;
    if (callerBalance < amount) {
      return { isOk: false, value: ERR_INSUFFICIENT_BALANCE };
    }
    this.stxBalances.set(this.caller, callerBalance - amount);
    const contractBalance = this.stxBalances.get("contract") || 0n;
    this.stxBalances.set("contract", contractBalance + amount);
    this.stxTransfers.push({ amount, from: this.caller, to: "contract" });
    const key = `${assetId}-${this.caller}`;
    const currentState = this.state.poolStates.get(key) || { staked: 0n, yieldAccrued: 0n, lastDepositTime: 0n, lockedUntil: 0n };
    const newStaked = currentState.staked + amount;
    const newLockedUntil = this.blockHeight + asset.lockPeriod;
    const newState: PoolState = { staked: newStaked, yieldAccrued: currentState.yieldAccrued, lastDepositTime: this.blockHeight, lockedUntil: newLockedUntil };
    this.state.poolStates.set(key, newState);
    const lpBalance = this.lpTokenBalances.get(this.caller) || 0n;
    this.lpTokenBalances.set(this.caller, lpBalance + amount);
    this.ftMints.push({ amount, to: this.caller });
    this.events.push({ event: "liquidity-added", assetId, amount, user: this.caller });
    return { isOk: true, value: true };
  }

  withdrawLiquidity(assetId: bigint, amount: bigint): Result<bigint> {
    const asset = this.state.assets.get(assetId);
    if (!asset) {
      return { isOk: false, value: ERR_ASSET_NOT_FOUND };
    }
    if (this.state.poolPaused) {
      return { isOk: false, value: ERR_POOL_PAUSED };
    }
    const key = `${assetId}-${this.caller}`;
    const currentState = this.state.poolStates.get(key);
    if (!currentState) {
      return { isOk: false, value: ERR_ASSET_NOT_FOUND };
    }
    if (currentState.staked < amount) {
      return { isOk: false, value: ERR_INSUFFICIENT_BALANCE };
    }
    if (this.blockHeight < currentState.lockedUntil) {
      return { isOk: false, value: ERR_CLAIM_NOT_READY };
    }
    const penalty = this.blockHeight < currentState.lastDepositTime + asset.lockPeriod ? (amount * asset.penaltyRate) / 10000n : 0n;
    const netAmount = amount - penalty;
    const newStaked = currentState.staked - amount;
    const newState: PoolState = { ...currentState, staked: newStaked };
    this.state.poolStates.set(key, newState);
    const lpBalance = this.lpTokenBalances.get(this.caller) || 0n;
    if (lpBalance < amount) {
      return { isOk: false, value: ERR_INSUFFICIENT_BALANCE };
    }
    this.lpTokenBalances.set(this.caller, lpBalance - amount);
    this.ftBurns.push({ amount, from: this.caller });
    const contractBalance = this.stxBalances.get("contract") || 0n;
    this.stxBalances.set("contract", contractBalance - netAmount);
    const callerBalance = this.stxBalances.get(this.caller) || 0n;
    this.stxBalances.set(this.caller, callerBalance + netAmount);
    this.stxTransfers.push({ amount: netAmount, from: "contract", to: this.caller });
    if (penalty > 0n) {
      const authority = this.state.authorityContract;
      if (authority) {
        const authBalance = this.stxBalances.get(authority) || 0n;
        this.stxBalances.set(authority, authBalance + penalty);
        this.stxTransfers.push({ amount: penalty, from: "contract", to: authority });
      }
    }
    this.events.push({ event: "liquidity-withdrawn", assetId, amount: netAmount, penalty, user: this.caller });
    return { isOk: true, value: netAmount };
  }

  claimYield(assetId: bigint): Result<bigint> {
    const asset = this.state.assets.get(assetId);
    if (!asset) {
      return { isOk: false, value: ERR_ASSET_NOT_FOUND };
    }
    if (this.state.poolPaused) {
      return { isOk: false, value: ERR_POOL_PAUSED };
    }
    const key = `${assetId}-${this.caller}`;
    const currentState = this.state.poolStates.get(key);
    if (!currentState) {
      return { isOk: false, value: ERR_ASSET_NOT_FOUND };
    }
    const timeElapsed = this.blockHeight - currentState.lastDepositTime;
    const yieldEarned = (currentState.staked * asset.yieldRate * timeElapsed) / 1000000n;
    const newAccrued = currentState.yieldAccrued + yieldEarned;
    const newState: PoolState = { ...currentState, yieldAccrued: 0n, lastDepositTime: this.blockHeight };
    this.state.poolStates.set(key, newState);
    const contractBalance = this.stxBalances.get("contract") || 0n;
    this.stxBalances.set("contract", contractBalance - newAccrued);
    const callerBalance = this.stxBalances.get(this.caller) || 0n;
    this.stxBalances.set(this.caller, callerBalance + newAccrued);
    this.stxTransfers.push({ amount: newAccrued, from: "contract", to: this.caller });
    this.events.push({ event: "yield-claimed", assetId, amount: newAccrued, user: this.caller });
    return { isOk: true, value: newAccrued };
  }

  transferFunds(to: string, amount: bigint): Result<boolean> {
    if (this.state.authorityContract === null) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.caller !== this.state.authorityContract) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    const contractBalance = this.stxBalances.get("contract") || 0n;
    if (contractBalance < amount) {
      return { isOk: false, value: ERR_INSUFFICIENT_BALANCE };
    }
    this.stxBalances.set("contract", contractBalance - amount);
    const toBalance = this.stxBalances.get(to) || 0n;
    this.stxBalances.set(to, toBalance + amount);
    this.stxTransfers.push({ amount, from: "contract", to });
    return { isOk: true, value: true };
  }

  getAssetCount(): Result<bigint> {
    return { isOk: true, value: this.state.nextAssetId };
  }

  checkAssetExistence(symbol: string): Result<boolean> {
    return { isOk: true, value: this.state.assetsBySymbol.has(symbol) };
  }

  getAsset(id: bigint): Asset | undefined {
    return this.state.assets.get(id);
  }

  getPoolState(assetId: bigint, user: string): PoolState | undefined {
    const key = `${assetId}-${user}`;
    return this.state.poolStates.get(key);
  }

  setAssetStatus(assetId: bigint, status: boolean): Result<boolean> {
    const asset = this.state.assets.get(assetId);
    if (!asset) {
      return { isOk: false, value: ERR_ASSET_NOT_FOUND };
    }
    if (asset.creator !== this.caller) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    const updated: Asset = { ...asset, status };
    this.state.assets.set(assetId, updated);
    return { isOk: true, value: true };
  }

  proposeGovChange(assetId: bigint, newThreshold: bigint): Result<boolean> {
    const asset = this.state.assets.get(assetId);
    if (!asset) {
      return { isOk: false, value: ERR_ASSET_NOT_FOUND };
    }
    const key = `${assetId}-${this.caller}`;
    const state = this.state.poolStates.get(key);
    if (!state || state.staked < asset.govThreshold) {
      return { isOk: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newThreshold <= 0n || newThreshold > 100n) {
      return { isOk: false, value: ERR_INVALID_GOV_THRESHOLD };
    }
    const updated: Asset = { ...asset, govThreshold: newThreshold };
    this.state.assets.set(assetId, updated);
    return { isOk: true, value: true };
  }
}

describe("LiquidityPoolMock", () => {
  let contract: LiquidityPoolMock;

  beforeEach(() => {
    contract = new LiquidityPoolMock();
    contract.reset();
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets max assets successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMaxAssets(20n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxAssets).toBe(20n);
  });

  it("rejects max assets change without authority", () => {
    const result = contract.setMaxAssets(20n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets pool fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setPoolFee(1000n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.poolFee).toBe(1000n);
  });

  it("rejects pool fee change without authority", () => {
    const result = contract.setPoolFee(1000n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("pauses pool successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.pausePool(true);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.poolPaused).toBe(true);
  });

  it("rejects pause without authority", () => {
    const result = contract.pausePool(true);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("adds asset successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(0n);
    const asset = contract.getAsset(0n);
    expect(asset?.symbol).toBe("STX");
    expect(asset?.minDeposit).toBe(100n);
    expect(asset?.maxDeposit).toBe(10000n);
    expect(asset?.yieldRate).toBe(500n);
    expect(asset?.lockPeriod).toBe(30n);
    expect(asset?.penaltyRate).toBe(100n);
    expect(asset?.govThreshold).toBe(50n);
    expect(asset?.location).toBe("LocationX");
    expect(asset?.currency).toBe("STX");
    expect(contract.stxTransfers).toEqual([{ amount: 500n, from: "ST1TEST", to: "ST2TEST" }]);
    expect(contract.events[0].event).toBe("asset-added");
  });

  it("rejects duplicate asset symbols", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    const result = contract.addAsset("STX", 200n, 20000n, 600n, 60n, 200n, 60n, "LocationY", "USD");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_ASSET_ALREADY_EXISTS);
  });

  it("rejects asset addition without authority", () => {
    const result = contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid min deposit", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addAsset("STX", 0n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MIN_DEPOSIT);
  });

  it("rejects invalid yield rate", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addAsset("STX", 100n, 10000n, 1001n, 30n, 100n, 50n, "LocationX", "STX");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_INVALID_YIELD_RATE);
  });

  it("updates asset successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("OLD", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    const result = contract.updateAsset(0n, "NEW", 200n, 20000n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    const asset = contract.getAsset(0n);
    expect(asset?.symbol).toBe("NEW");
    expect(asset?.minDeposit).toBe(200n);
    expect(asset?.maxDeposit).toBe(20000n);
    const update = contract.state.assetUpdates.get(0n);
    expect(update?.updateSymbol).toBe("NEW");
    expect(update?.updateMinDeposit).toBe(200n);
    expect(update?.updateMaxDeposit).toBe(20000n);
    expect(update?.updater).toBe("ST1TEST");
    expect(contract.events[1].event).toBe("asset-updated");
  });

  it("rejects update for non-existent asset", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateAsset(99n, "NEW", 200n, 20000n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_ASSET_NOT_FOUND);
  });

  it("rejects update by non-creator", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.caller = "ST3FAKE";
    const result = contract.updateAsset(0n, "NEW", 200n, 20000n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("adds liquidity successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    const result = contract.addLiquidity(0n, 500n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    const state = contract.getPoolState(0n, "ST1TEST");
    expect(state?.staked).toBe(500n);
    expect(state?.lockedUntil).toBe(30n);
    expect(contract.lpTokenBalances.get("ST1TEST")).toBe(500n);
    expect(contract.events[1].event).toBe("liquidity-added");
  });

  it("rejects add liquidity when paused", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.pausePool(true);
    const result = contract.addLiquidity(0n, 500n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_POOL_PAUSED);
  });

  it("rejects add liquidity invalid amount", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    const result = contract.addLiquidity(0n, 50n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("withdraws liquidity successfully without penalty", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addLiquidity(0n, 500n);
    contract.blockHeight = 60n;
    const result = contract.withdrawLiquidity(0n, 500n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(500n);
    const state = contract.getPoolState(0n, "ST1TEST");
    expect(state?.staked).toBe(0n);
    expect(contract.lpTokenBalances.get("ST1TEST")).toBe(0n);
    expect(contract.events[2].event).toBe("liquidity-withdrawn");
  });

  it("rejects claim yield when paused", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addLiquidity(0n, 1000n);
    contract.pausePool(true);
    const result = contract.claimYield(0n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_POOL_PAUSED);
  });

  it("transfers funds successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.stxBalances.set("contract", 1000n);
    contract.caller = "ST2TEST";
    const result = contract.transferFunds("ST3RECIPIENT", 500n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.stxBalances.get("contract")).toBe(500n);
    expect(contract.stxBalances.get("ST3RECIPIENT")).toBe(500n);
  });

  it("rejects transfer funds without authority", () => {
    contract.stxBalances.set("contract", 1000n);
    const result = contract.transferFunds("ST3RECIPIENT", 500n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets asset count correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addAsset("BTC", 200n, 20000n, 600n, 60n, 200n, 60n, "LocationY", "BTC");
    const result = contract.getAssetCount();
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(2n);
  });

  it("checks asset existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    const result = contract.checkAssetExistence("STX");
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkAssetExistence("NON");
    expect(result2.isOk).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("sets asset status successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    const result = contract.setAssetStatus(0n, false);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
    const asset = contract.getAsset(0n);
    expect(asset?.status).toBe(false);
  });

  it("rejects set asset status by non-creator", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.caller = "ST3FAKE";
    const result = contract.setAssetStatus(0n, false);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects propose gov change insufficient stake", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addLiquidity(0n, 40n);
    const result = contract.proposeGovChange(0n, 70n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("handles multiple assets and liquidity additions", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addAsset("BTC", 200n, 20000n, 600n, 60n, 200n, 60n, "LocationY", "BTC");
    contract.addLiquidity(0n, 500n);
    contract.addLiquidity(1n, 1000n);
    const state0 = contract.getPoolState(0n, "ST1TEST");
    const state1 = contract.getPoolState(1n, "ST1TEST");
    expect(state0?.staked).toBe(500n);
    expect(state1?.staked).toBe(1000n);
  });

  it("handles yield claims over time", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addLiquidity(0n, 1000n);
    contract.blockHeight = 50n;
    const claim1 = contract.claimYield(0n);
    expect(claim1.isOk).toBe(true);
    expect(claim1.value).toBe(25n);
    contract.blockHeight = 100n;
    const claim2 = contract.claimYield(0n);
    expect(claim2.isOk).toBe(true);
    expect(claim2.value).toBe(25n);
  });

  it("rejects add asset with max assets exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxAssets = 1n;
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    const result = contract.addAsset("BTC", 200n, 20000n, 600n, 60n, 200n, 60n, "LocationY", "BTC");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_MAX_ASSETS_EXCEEDED);
  });

  it("rejects add asset with invalid location", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "", "STX");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LOCATION);
  });

  it("rejects add asset with invalid currency", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "INVALID");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("rejects withdraw liquidity insufficient balance", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addLiquidity(0n, 500n);
    contract.blockHeight = 60n;
    const result = contract.withdrawLiquidity(0n, 600n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("rejects claim yield no state", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    const result = contract.claimYield(0n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_ASSET_NOT_FOUND);
  });

  it("rejects transfer funds insufficient contract balance", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.transferFunds("ST3RECIPIENT", 500n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("handles lp token mint and burn correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addLiquidity(0n, 500n);
    expect(contract.lpTokenBalances.get("ST1TEST")).toBe(500n);
    contract.blockHeight = 60n;
    contract.withdrawLiquidity(0n, 500n);
    expect(contract.lpTokenBalances.get("ST1TEST")).toBe(0n);
  });

  it("rejects add liquidity insufficient caller balance", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.stxBalances.set("ST1TEST", 50n);
    const result = contract.addLiquidity(0n, 100n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("rejects withdraw liquidity before lock period without checking penalty correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addAsset("STX", 100n, 10000n, 500n, 30n, 100n, 50n, "LocationX", "STX");
    contract.addLiquidity(0n, 1000n);
    contract.blockHeight = 20n;
    const result = contract.withdrawLiquidity(0n, 1000n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(ERR_CLAIM_NOT_READY);
  });
});