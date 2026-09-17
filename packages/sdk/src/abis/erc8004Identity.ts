// Hand-written minimal ABI.
export const erc8004IdentityAbi = [
  {
    "type": "function",
    "name": "register",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "agentURI",
        "type": "string"
      }
    ],
    "outputs": [
      {
        "name": "agentId",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "ownerOf",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "type": "address"
      }
    ]
  },
  {
    "type": "function",
    "name": "tokenURI",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "type": "string"
      }
    ]
  },
  {
    "type": "function",
    "name": "getAgentWallet",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "type": "address"
      }
    ]
  },
  {
    "type": "event",
    "name": "Registered",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "agentURI",
        "type": "string",
        "indexed": false
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      }
    ]
  }
] as const;
