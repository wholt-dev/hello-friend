# Deploy a Token

Launch an ERC-20 in one transaction. The factory is `LITDEX_DEPLOYER` — audited, gasless of fee, points-earning.

## Form fields

| Field | Notes |
| --- | --- |
| Name | The full token name, e.g. `LitDEX Treasury Token` |
| Symbol | 3–8 chars, all caps, e.g. `LDXT` |
| Total supply | Whole number. Decimals fixed at 18. |

## What happens on deploy

1. The dApp builds a deploy transaction against `LITDEX_DEPLOYER.deployToken(name, symbol, supply)`.
2. You sign once.
3. The factory mints the entire `supply` to your wallet.
4. The relayer detects the new contract and credits **+5 pts** to you (idempotent on tx hash).
5. The success card prints the contract address + explorer link.

## After deploy

Your token is a fully standard ERC-20. You can:

- send it to anyone with `transfer`,
- create a [pool](/pool/add) by pairing it with zkLTC,
- list it on the [marketplace](/hub/market) if it's a `.lit` collectible token,
- import the address into your wallet to see balances.

> Deploys are uncapped per wallet. You can launch as many tokens as you want — the daily +5 pts cap stops earning more rewards but the contracts still deploy.

## Best practices

- **Test small first**: deploy a "yourname-test" with 1000 supply, swap it, then iterate.
- **Pick a unique symbol**: explorers and aggregators de-dupe by symbol; clashing with a major token is annoying.
- **Lock LP if you want trust**: send some of your token + paired zkLTC to a pool, then send the LP tokens to a burn address. This is community convention for fair launches.

## Source

The deploy page also shows the exact Solidity that `LITDEX_DEPLOYER` will deploy on your behalf. It is a vanilla `ERC20Burnable` from OpenZeppelin with the constructor minting the supply to `msg.sender` (your wallet).
