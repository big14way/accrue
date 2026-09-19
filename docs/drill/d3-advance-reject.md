# D3 — Advance against escrow, rejection, bond seizure, score drop

Ran 2026-09-19T16:32:27.802Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client creates job | ✓ | jobId 3 | [0x3e8dd983…](https://testnet.monadexplorer.com/tx/0x3e8dd983931df342139551ea1243147ddf6ec6daae06e317385d09acfbd9a2ab) |
| provider quotes budget | ✓ |  | [0x4994fb73…](https://testnet.monadexplorer.com/tx/0x4994fb73fdf6f62350e09937d3fbbf936f6dc0c368e22e982b4e79d070017fd9) |
| client funds | ✓ |  | [0x3c65ddb4…](https://testnet.monadexplorer.com/tx/0x3c65ddb4db63fb04a54ac543b12cbcba556be44fb8966556ddab55071752f2bf) |
| credit limit from ERC-8004 history | ✓ | max advance 100 tUSD (10 % of budget, APR 33 %, bond 55 %) |  |
| provider takes the full advance | ✓ |  | [0x108f9297…](https://testnet.monadexplorer.com/tx/0x108f92979de50fe8dbd3acf3f5fefeac40155d97995d9688d072c6dfc06f5631) |
| cash arrived now (advance minus bond) | ✓ | provider +45 tUSD |  |
| provider submits a hash that does not match what it serves | ✓ |  | [0x26227767…](https://testnet.monadexplorer.com/tx/0x26227767845835384300ef7f29227b260eda044fe2c12765a84690e5f8151842) |
| committee member 0x254334 attests REJECT | ✓ |  | [0xcc173cc3…](https://testnet.monadexplorer.com/tx/0xcc173cc302faf3b50f59cc56af839d1abf7bf946d38108803ce9f9636058d872) |
| client refunded | ✓ | status Rejected |  |
| anyone resolves the lien → bond seized, shortfall recorded, ERC-8004 default written | ✓ |  | [0x37ba799b…](https://testnet.monadexplorer.com/tx/0x37ba799b13326e6631f24d84b01588de0324e245b1da948d7efc2cc28754b175) |
| pool absorbed the priced loss | ✓ | shortfall +45 tUSD; defaults 0 → 1 |  |
| provider credit limit dropped | ✓ | maxAdvance 10 % → 0 %, APR 33 % → 38 % |  |

- **jobId**: 3
- **advance**: 0x108f92979de50fe8dbd3acf3f5fefeac40155d97995d9688d072c6dfc06f5631
- **scoreBefore**: `{"onTime":1,"late":0,"rejected":1,"repaid":0,"defaults":0,"maxAdvanceBps":1000,"aprBps":3300,"rateWadPerBlock":"4185692541","bondBps":5500,"formula":{"maxAdvance":"min(80 %, 20 % + 5 %·onTime + 2 %·late − 15 %·rejected − 30 %·defaults)","apr":"max(6 %, 30 % − 2 %·onTime + 5 %·rejected + 10 %·defaults), charged per 400 ms block","bond":"clamp(50 % − 5 %·onTime + 10 %·rejected, 10 %, 100 %) of the advance"}}`
- **scoreAfter**: `{"onTime":1,"late":0,"rejected":2,"repaid":0,"defaults":0,"maxAdvanceBps":0,"aprBps":3800,"rateWadPerBlock":"4819888381","bondBps":6500,"formula":{"maxAdvance":"min(80 %, 20 % + 5 %·onTime + 2 %·late − 15 %·rejected − 30 %·defaults)","apr":"max(6 %, 30 % − 2 %·onTime + 5 %·rejected + 10 %·defaults), charged per 400 ms block","bond":"clamp(50 % − 5 %·onTime + 10 %·rejected, 10 %, 100 %) of the advance"}}`
