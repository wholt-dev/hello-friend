# Deploy Vesting

Distribute tokens on a linear schedule with an optional cliff. Useful for team allocations, advisor grants, or token unlocks.

## Form fields

| Field | Notes |
| --- | --- |
| Token | Address of the token being vested |
| Beneficiary | Wallet that can `release()` |
| Start | Unix timestamp when vesting begins |
| Cliff (seconds) | Time before any tokens are claimable |
| Duration (seconds) | Total time over which all tokens vest linearly |
| Total amount | Tokens locked into the contract |

Example schedule for a 6-month cliff + 24-month linear:

| Field | Value |
| --- | --- |
| Start | now |
| Cliff | `15724800` (6 months in seconds) |
| Duration | `63072000` (24 months) |

## How releases work

The beneficiary calls `release(token)` on the vesting contract. The contract computes how many tokens have vested up to `block.timestamp` minus what's already been released, and transfers the difference.

Anyone can call `release(token)` — only the beneficiary receives the tokens. This means a relayer or the team can pay gas for the beneficiary.

## Funding the contract

After deploy you must transfer the `total amount` of tokens to the vesting contract. The dApp prompts for this in a follow-up step.

```bash
ERC20(vestingToken).transfer(vestingContract, totalAmount);
```

If the contract is underfunded, releases will partial-succeed up to the contract's balance.

## Revoke

The factory has an optional `revocable` flag. If set:

- the **owner** (deployer) can call `revoke(token)` to claw back unvested tokens.
- anything already vested still belongs to the beneficiary.

If `revocable = false` the contract is immutable — once funded, only the beneficiary can withdraw.

> For team / advisor grants, default to **revocable = false** so beneficiaries trust the schedule.
