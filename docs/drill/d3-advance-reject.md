# D3 — Advance against escrow, rejection, bond seizure, score drop

Ran 2026-09-23T08:43:14.242Z — **PASS**

| Step | Result | Detail | Tx |
|---|---|---|---|
| client creates job | ✓ | jobId 4 | [0x0ea0e058…](https://testnet.monadexplorer.com/tx/0x0ea0e05812e0e43e74f53b2c9afb32b08d85543324b5ed904f75593173a98cc0) |
| provider quotes budget | ✓ |  | [0xbb762908…](https://testnet.monadexplorer.com/tx/0xbb762908ab1d4561166992874e0874946804fa4a6af794975f9287fd0bb23ff0) |
| client funds | ✓ |  | [0x1ff148e3…](https://testnet.monadexplorer.com/tx/0x1ff148e381c056d49cd1807884c27bba9b8a1069e19e6a015adec14bfc6a8325) |
| credit limit from ERC-8004 history | ✓ | max advance 100 AUSD (10 % of budget, APR 33 %, bond 55 %) |  |
| provider takes the full advance | ✓ |  | [0x57c7c15a…](https://testnet.monadexplorer.com/tx/0x57c7c15ad70c221c03f8df07aef75fcbdcb56f795787fbcbe47db88716c54c4a) |
| cash arrived now (advance minus bond) | ✓ | provider +45 AUSD |  |
| provider submits a hash that does not match what it serves | ✓ |  | [0x8a387cb1…](https://testnet.monadexplorer.com/tx/0x8a387cb18293051a9f09c1f04d4303e0dba3bc4a3942dcbab549d90ba33f808c) |
| committee member 0x254334 attests REJECT | ✓ |  | [0x61253fe7…](https://testnet.monadexplorer.com/tx/0x61253fe76fbc8e99c06689a070256c7cc8ed28c1e4e178a1f1335775428b2208) |
| client refunded | ✓ | status Rejected |  |
| anyone resolves the lien → bond seized, shortfall recorded, ERC-8004 default written | ✓ |  | [0xbb030f21…](https://testnet.monadexplorer.com/tx/0xbb030f21e6da215a190247e99910f7eb370792c60472679a794f9600660e464d) |
| pool absorbed the priced loss | ✓ | shortfall +45 AUSD; defaults 0 → 1 |  |
| provider credit limit dropped | ✓ | maxAdvance 10 % → 0 %, APR 33 % → 38 % |  |

- **jobId**: 4
- **advance**: 0x57c7c15ad70c221c03f8df07aef75fcbdcb56f795787fbcbe47db88716c54c4a
- **scoreBefore**: `{"onTime":1,"late":0,"rejected":1,"repaid":0,"defaults":0,"maxAdvanceBps":1000,"aprBps":3300,"rateWadPerBlock":"4185692541","bondBps":5500,"formula":{"maxAdvance":"min(80 %, 20 % + 5 %·onTime + 2 %·late − 15 %·rejected − 30 %·defaults)","apr":"max(6 %, 30 % − 2 %·onTime + 5 %·rejected + 10 %·defaults), charged per 400 ms block","bond":"clamp(50 % − 5 %·onTime + 10 %·rejected, 10 %, 100 %) of the advance"}}`
- **scoreAfter**: `{"onTime":1,"late":0,"rejected":2,"repaid":0,"defaults":0,"maxAdvanceBps":0,"aprBps":3800,"rateWadPerBlock":"4819888381","bondBps":6500,"formula":{"maxAdvance":"min(80 %, 20 % + 5 %·onTime + 2 %·late − 15 %·rejected − 30 %·defaults)","apr":"max(6 %, 30 % − 2 %·onTime + 5 %·rejected + 10 %·defaults), charged per 400 ms block","bond":"clamp(50 % − 5 %·onTime + 10 %·rejected, 10 %, 100 %) of the advance"}}`
