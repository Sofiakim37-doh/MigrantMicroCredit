(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-POOL-PAUSED u103)
(define-constant ERR-INVALID-ASSET u104)
(define-constant ERR-CLAIM-NOT-READY u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-INVALID-YIELD-RATE u107)
(define-constant ERR-INVALID-LOCK-PERIOD u108)
(define-constant ERR-MAX-ASSETS-EXCEEDED u109)
(define-constant ERR-INVALID-PENALTY-RATE u110)
(define-constant ERR-INVALID-GOV-THRESHOLD u111)
(define-constant ERR-ASSET-ALREADY-EXISTS u112)
(define-constant ERR-ASSET-NOT-FOUND u113)
(define-constant ERR-INVALID-UPDATE-PARAM u114)
(define-constant ERR-UPDATE-NOT-ALLOWED u115)
(define-constant ERR-INVALID-STATUS u116)
(define-constant ERR-INVALID-LOCATION u117)
(define-constant ERR-INVALID-CURRENCY u118)
(define-constant ERR-INVALID-MIN-DEPOSIT u119)
(define-constant ERR-INVALID-MAX-DEPOSIT u120)
(define-data-var next-asset-id uint u0)
(define-data-var max-assets uint u10)
(define-data-var pool-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-data-var pool-paused bool false)
(define-map assets
  uint
  {
    symbol: (string-utf8 20),
    min-deposit: uint,
    max-deposit: uint,
    yield-rate: uint,
    lock-period: uint,
    penalty-rate: uint,
    gov-threshold: uint,
    timestamp: uint,
    creator: principal,
    status: bool,
    location: (string-utf8 100),
    currency: (string-utf8 20)
  }
)
(define-map assets-by-symbol
  (string-utf8 20)
  uint)
(define-map pool-states
  { asset-id: uint, user: principal }
  {
    staked: uint,
    yield-accrued: uint,
    last-deposit-time: uint,
    locked-until: uint
  }
)
(define-map asset-updates
  uint
  {
    update-symbol: (string-utf8 20),
    update-min-deposit: uint,
    update-max-deposit: uint,
    update-timestamp: uint,
    updater: principal
  }
)
(define-fungible-token lp-token u1000000000)
(define-read-only (get-asset (id uint))
  (map-get? assets id)
)
(define-read-only (get-asset-updates (id uint))
  (map-get? asset-updates id)
)
(define-read-only (is-asset-registered (symbol (string-utf8 20)))
  (is-some (map-get? assets-by-symbol symbol))
)
(define-read-only (get-pool-state (asset-id uint) (user principal))
  (map-get? pool-states { asset-id: asset-id, user: user })
)
(define-private (validate-symbol (symbol (string-utf8 20)))
  (if (and (> (len symbol) u0) (<= (len symbol) u20))
      (ok true)
      (err ERR-INVALID-UPDATE-PARAM))
)
(define-private (validate-min-deposit (min uint))
  (if (> min u0)
      (ok true)
      (err ERR-INVALID-MIN-DEPOSIT))
)
(define-private (validate-max-deposit (max uint))
  (if (> max u0)
      (ok true)
      (err ERR-INVALID-MAX-DEPOSIT))
)
(define-private (validate-yield-rate (rate uint))
  (if (<= rate u1000)
      (ok true)
      (err ERR-INVALID-YIELD-RATE))
)
(define-private (validate-lock-period (period uint))
  (if (> period u0)
      (ok true)
      (err ERR-INVALID-LOCK-PERIOD))
)
(define-private (validate-penalty-rate (rate uint))
  (if (<= rate u500)
      (ok true)
      (err ERR-INVALID-PENALTY-RATE))
)
(define-private (validate-gov-threshold (threshold uint))
  (if (and (> threshold u0) (<= threshold u100))
      (ok true)
      (err ERR-INVALID-GOV-THRESHOLD))
)
(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)
(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)
(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur u"STX") (is-eq cur u"USD") (is-eq cur u"BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)
(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)
(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)
(define-public (set-max-assets (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set max-assets new-max)
    (ok true)
  )
)
(define-public (set-pool-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set pool-fee new-fee)
    (ok true)
  )
)
(define-public (pause-pool (paused bool))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set pool-paused paused)
    (ok true)
  )
)
(define-public (add-asset
  (symbol (string-utf8 20))
  (min-deposit uint)
  (max-deposit uint)
  (yield-rate uint)
  (lock-period uint)
  (penalty-rate uint)
  (gov-threshold uint)
  (location (string-utf8 100))
  (currency (string-utf8 20))
)
  (let (
        (next-id (var-get next-asset-id))
        (current-max (var-get max-assets))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ASSETS-EXCEEDED))
    (try! (validate-symbol symbol))
    (try! (validate-min-deposit min-deposit))
    (try! (validate-max-deposit max-deposit))
    (try! (validate-yield-rate yield-rate))
    (try! (validate-lock-period lock-period))
    (try! (validate-penalty-rate penalty-rate))
    (try! (validate-gov-threshold gov-threshold))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (asserts! (is-none (map-get? assets-by-symbol symbol)) (err ERR-ASSET-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-NOT-AUTHORIZED))))
      (try! (stx-transfer? (var-get pool-fee) tx-sender authority-recipient))
    )
    (map-set assets next-id
      {
        symbol: symbol,
        min-deposit: min-deposit,
        max-deposit: max-deposit,
        yield-rate: yield-rate,
        lock-period: lock-period,
        penalty-rate: penalty-rate,
        gov-threshold: gov-threshold,
        timestamp: block-height,
        creator: tx-sender,
        status: true,
        location: location,
        currency: currency
      }
    )
    (map-set assets-by-symbol symbol next-id)
    (var-set next-asset-id (+ next-id u1))
    (print { event: "asset-added", id: next-id })
    (ok next-id)
  )
)
(define-public (update-asset
  (asset-id uint)
  (update-symbol (string-utf8 20))
  (update-min-deposit uint)
  (update-max-deposit uint)
)
  (let ((asset (map-get? assets asset-id)))
    (match asset
      a
        (begin
          (asserts! (is-eq (get creator a) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-symbol update-symbol))
          (try! (validate-min-deposit update-min-deposit))
          (try! (validate-max-deposit update-max-deposit))
          (let ((existing (map-get? assets-by-symbol update-symbol)))
            (match existing
              existing-id
                (asserts! (is-eq existing-id asset-id) (err ERR-ASSET-ALREADY-EXISTS))
              (begin true)
            )
          )
          (let ((old-symbol (get symbol a)))
            (if (is-eq old-symbol update-symbol)
                (ok true)
                (begin
                  (map-delete assets-by-symbol old-symbol)
                  (map-set assets-by-symbol update-symbol asset-id)
                  (ok true)
                )
            )
          )
          (map-set assets asset-id
            {
              symbol: update-symbol,
              min-deposit: update-min-deposit,
              max-deposit: update-max-deposit,
              yield-rate: (get yield-rate a),
              lock-period: (get lock-period a),
              penalty-rate: (get penalty-rate a),
              gov-threshold: (get gov-threshold a),
              timestamp: block-height,
              creator: (get creator a),
              status: (get status a),
              location: (get location a),
              currency: (get currency a)
            }
          )
          (map-set asset-updates asset-id
            {
              update-symbol: update-symbol,
              update-min-deposit: update-min-deposit,
              update-max-deposit: update-max-deposit,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "asset-updated", id: asset-id })
          (ok true)
        )
      (err ERR-ASSET-NOT-FOUND)
    )
  )
)
(define-public (add-liquidity (asset-id uint) (amount uint))
  (let (
        (asset (unwrap! (map-get? assets asset-id) (err ERR-ASSET-NOT-FOUND)))
        (caller tx-sender)
        (current-state (default-to { staked: u0, yield-accrued: u0, last-deposit-time: u0, locked-until: u0 } (map-get? pool-states { asset-id: asset-id, user: caller })))
      )
    (asserts! (not (var-get pool-paused)) (err ERR-POOL-PAUSED))
    (asserts! (>= amount (get min-deposit asset)) (err ERR-INVALID-AMOUNT))
    (asserts! (<= amount (get max-deposit asset)) (err ERR-INVALID-AMOUNT))
    (asserts! (>= (stx-get-balance caller) amount) (err ERR-INSUFFICIENT-BALANCE))
    (try! (stx-transfer? amount caller (as-contract tx-sender)))
    (let (
          (new-staked (+ (get staked current-state) amount))
          (new-locked-until (+ block-height (get lock-period asset)))
          (new-state { staked: new-staked, yield-accrued: (get yield-accrued current-state), last-deposit-time: block-height, locked-until: new-locked-until })
        )
      (map-set pool-states { asset-id: asset-id, user: caller } new-state)
      (try! (as-contract (ft-mint? lp-token amount caller)))
      (print { event: "liquidity-added", asset-id: asset-id, amount: amount, user: caller })
      (ok true)
    )
  )
)
(define-public (withdraw-liquidity (asset-id uint) (amount uint))
  (let (
        (asset (unwrap! (map-get? assets asset-id) (err ERR-ASSET-NOT-FOUND)))
        (caller tx-sender)
        (current-state (unwrap! (map-get? pool-states { asset-id: asset-id, user: caller }) (err ERR-ASSET-NOT-FOUND)))
      )
    (asserts! (not (var-get pool-paused)) (err ERR-POOL-PAUSED))
    (asserts! (>= (get staked current-state) amount) (err ERR-INSUFFICIENT-BALANCE))
    (asserts! (>= block-height (get locked-until current-state)) (err ERR-CLAIM-NOT-READY))
    (let (
          (penalty (if (< block-height (+ (get last-deposit-time current-state) (get lock-period asset)))
                       (/ (* amount (get penalty-rate asset)) u10000)
                       u0))
          (net-amount (- amount penalty))
          (new-staked (- (get staked current-state) amount))
          (new-state { staked: new-staked, yield-accrued: (get yield-accrued current-state), last-deposit-time: (get last-deposit-time current-state), locked-until: (get locked-until current-state) })
        )
      (map-set pool-states { asset-id: asset-id, user: caller } new-state)
      (try! (as-contract (ft-burn? lp-token amount caller)))
      (try! (as-contract (stx-transfer? net-amount tx-sender caller)))
      (if (> penalty u0)
          (try! (as-contract (stx-transfer? penalty tx-sender (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))))
          (ok true))
      (print { event: "liquidity-withdrawn", asset-id: asset-id, amount: net-amount, penalty: penalty, user: caller })
      (ok net-amount)
    )
  )
)
(define-public (claim-yield (asset-id uint))
  (let (
        (asset (unwrap! (map-get? assets asset-id) (err ERR-ASSET-NOT-FOUND)))
        (caller tx-sender)
        (current-state (unwrap! (map-get? pool-states { asset-id: asset-id, user: caller }) (err ERR-ASSET-NOT-FOUND)))
      )
    (asserts! (not (var-get pool-paused)) (err ERR-POOL-PAUSED))
    (let (
          (time-elapsed (- block-height (get last-deposit-time current-state)))
          (yield-earned (/ (* (get staked current-state) (get yield-rate asset) time-elapsed) u1000000))
          (new-accrued (+ (get yield-accrued current-state) yield-earned))
          (new-state { staked: (get staked current-state), yield-accrued: u0, last-deposit-time: block-height, locked-until: (get locked-until current-state) })
        )
      (map-set pool-states { asset-id: asset-id, user: caller } new-state)
      (try! (as-contract (stx-transfer? new-accrued tx-sender caller)))
      (print { event: "yield-claimed", asset-id: asset-id, amount: new-accrued, user: caller })
      (ok new-accrued)
    )
  )
)
(define-public (transfer-funds (to principal) (amount uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED))) (err ERR-NOT-AUTHORIZED))
    (as-contract (stx-transfer? amount tx-sender to))
  )
)
(define-public (get-asset-count)
  (ok (var-get next-asset-id))
)
(define-public (check-asset-existence (symbol (string-utf8 20)))
  (ok (is-asset-registered symbol))
)
(define-public (get-total-staked (asset-id uint))
  (let (
        (keys (map-get? pool-states-keys asset-id))
      )
    (fold + (map (lambda (user) (get staked (unwrap-panic (map-get? pool-states { asset-id: asset-id, user: user })))) keys) u0)
  )
)
(define-public (set-asset-status (asset-id uint) (status bool))
  (let ((asset (map-get? assets asset-id)))
    (match asset
      a
        (begin
          (asserts! (is-eq (get creator a) tx-sender) (err ERR-NOT-AUTHORIZED))
          (map-set assets asset-id (merge a { status: status }))
          (ok true)
        )
      (err ERR-ASSET-NOT-FOUND)
    )
  )
)
(define-public (propose-gov-change (asset-id uint) (new-threshold uint))
  (let ((asset (unwrap! (map-get? assets asset-id) (err ERR-ASSET-NOT-FOUND))))
    (asserts! (>= (get staked (unwrap! (map-get? pool-states { asset-id: asset-id, user: tx-sender }) (err ERR-INSUFFICIENT-BALANCE))) (get gov-threshold asset)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-gov-threshold new-threshold))
    (map-set assets asset-id (merge asset { gov-threshold: new-threshold }))
    (ok true)
  )
)