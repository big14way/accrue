// Hand-written minimal ABI.
export const erc4626Abi = [
  {
    "type": "function",
    "name": "asset",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "type": "address"
      }
    ]
  },
  {
    "type": "function",
    "name": "totalAssets",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "previewRedeem",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "convertToAssets",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "balanceOf",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "account",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "type": "uint256"
      }
    ]
  }
] as const;
