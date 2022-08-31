---
title: 'Building blockchain from scratch in Go. Part 1: Basic Prototype'
date: '2022-08-30'
tags: ['blockchain', 'code', 'go']
draft: false
summary: In this series of articles we'll build a simplified cryptocurrency that's based on a simple blockchain implementation.
authors: ['eddieho', 'sparrowhawk']
---

## Introduction

Bitcoin was introduced to the world under a cloud of mystery in January 2009. A
white paper, Bitcoin: A Peer-to-Peer Electronic Cash System, published in 2008 under
the pseudonym of Satoshi Nakamoto, outlined the concept; to date, the authorship of
the paper remains unknown. What is known is that the underlining technology, the
blockchain, has implications for the accounting profession. Many are still wondering
what blockchain means for the accounting profession more than 10 years after its
introduction.

## Block

Let's start with the “block” part of “blockchain”. In blockchain it's blocks that
store valuable information. For example, bitcoin blocks store transactions, the
essence of any cryptocurrency. Besides this, a block contains some technical
information, like its version, current timestamp and the hash of the previous block.

In this article we're not going to implement the block as it's described in blockchain or Bitcoin specifications, instead we'll use a simplified version of it, which contains only significant information. Here's what it looks like:

```go
type Block struct {
	Timestamp     int64
	Data          []byte
	PrevBlockHash []byte
	Hash          []byte
}
```

Timestamp is the current timestamp (when the block is created), Data is the actual
valuable information containing in the block, PrevBlockHash stores the hash of the
previous block, and Hash is the hash of the block. In Bitcoint specification
Timestamp, PrevBlockHash, and Hash are block headers, which form a separate data
structure, and transactions (Data in our case) is a separate data structure. So
we're mixing them here for simplicity.

So how do we calculate the hashes? The way hashes are calculates is very important
feature of blockchain, and it's this feature that makes blockchain secure. The thing
is that calculating a hash is a computationally difficult operation, it takes some
time even on fast computers (that's why people buy powerful GPUs to mine Bitcoin).
This is an intentional architectural design, which makes adding new blocks
difficult, thus preventing their modification after they're added. We'll discuss and
implement this mechanism in a future article.

For now, we'll just take block fields, concatenate them, and calculate a SHA-256 hash on the concatenated combination. Let's do this in SetHash method:

```go
func (b *Block) SetHash() {
	timestamp := []byte(strconv.FormatInt(b.Timestamp, 10))
	headers := bytes.Join([][]byte{b.PrevBlockHash, b.Data, timestamp}, []byte{})
	hash := sha256.Sum256(headers)

	b.Hash = hash[:]
}
```

Next, following a Golang convention, we'll implement a function that'll simplify the creation of a block:

```go
func NewBlock(data string, prevBlockHash []byte) *Block {
	block := &Block{
		Timestamp:     time.Now().Unix(),
		Data:          []byte(data),
		PrevBlockHash: prevBlockHash,
		Hash:          []byte{},
	}
	block.SetHash()
	return block
}
```

And that's it for the block!

## Blockchain

Now let's implement a blockchain. In its essence blockchain is just a database with
certain structure: it's an ordered, back-linked list. Which means that blocks are
stored in the insertion order and that each block is linked to the previous one.
This structure allows to quickly get the latest block in a chain and to
(efficiently) get a block by its hash.

In Golang this structure can be implemented by using an array and a map: the array
would keep ordered hashes (arrays are ordered in Go), and the map would keep hash →
block pairs (maps are unordered). But for our blockchain prototype we'll just use an
array, because we don't need to get blocks by their hash for now.

```go
type Blockchain struct {
	blocks []*Block
}
```

This is our first blockchain! I've never thought it would be so easy 😉

Now let's make it possible to add blocks to it:

```go
func (bc *Blockchain) AddBlock(data string) {
	prevBlock := bc.blocks[len(bc.blocks)-1]
	newBlock := NewBlock(data, prevBlock.Hash)
	bc.blocks = append(bc.blocks, newBlock)
}
```

To add a new block we need an existing block, but there're not blocks in our
blockchain! So, in any blockchain, there must be at least one block, and such block,
the first in the chain, is called genesis block. Let's implement a method that
creates such a block:

```go
func NewGenesisBlock() *Block {
	return NewBlock("Genesis Block", []byte{})
}
```

Now, we can implement a function that creates a blockchain with the genesis block:

```go
func NewBlockchain() *Blockchain {
	return &Blockchain{[]*Block{NewGenesisBlock()}}
}
```

Let's check that the blockchain works correctly:

```go
func main() {
	bc := NewBlockchain()

	bc.AddBlock("Send 1 BTC to Ivan")
	bc.AddBlock("Send 2 more BTC to Ivan")

	for _, block := range bc.blocks {
		fmt.Printf("Prev. hash: %x\n", block.PrevBlockHash)
		fmt.Printf("Data: %s\n", block.Data)
		fmt.Printf("Hash: %x\n", block.Hash)
		fmt.Println()
	}
}
```

Output:

```sh
Prev. hash:
Data: Genesis Block
Hash: 087cc5e3492e75ea05cb01a2852982b8b6c6d672c6eda2d3b65958fa387f0a8c

Prev. hash: 087cc5e3492e75ea05cb01a2852982b8b6c6d672c6eda2d3b65958fa387f0a8c
Data: Send 1 BTC to Ivan
Hash: 55c566c351b5e391208adcf9ee99c4d734bd83359b2667058bc736379aa5dbd8

Prev. hash: 55c566c351b5e391208adcf9ee99c4d734bd83359b2667058bc736379aa5dbd8
Data: Send 2 more BTC to Ivan
Hash: a8e8ce10de294fd4dc18a7a533302eb4c8822168776ad6002b5d4b5d6de1bfa4
```

That's it!

## Conclusion

We built a very simple blockchain prototype: it's just an array of blocks, with each block having a connection to the previous one. The actual blockchain is much more complex though. In our blockchain adding new blocks is easy and fast, but in real blockchain adding new blocks requires some work: one has to perform some heavy computations before getting a permission to add block (this mechanism is called Proof-of-Work). Also, blockchain is a distributed database that has no single decision maker. Thus, a new block must be confirmed and approved by other participants of the network (this mechanism is called consensus). And there're no transactions in our blockchain yet!

In future articles we'll cover each of these features.

## References

[An Introduction to Blockchain](https://www.cpajournal.com/2021/08/18/an-introduction-to-blockchain/)

[Building Blockchain in Go](https://jeiwan.net/posts/building-blockchain-in-go-part-1/)

[Full Source Code](https://github.com/noodleslove/blockchain-go/tree/part_1)
