---
title: 'Building blockchain in Go. Part 3: Persistence and CLI'
date: '2022-09-02'
tags: ['blockchain', 'code', 'go']
draft: false
summary: In this series of articles we'll build a simplified cryptocurrency that's based on a simple blockchain implementation.
authors: ['eddieho']
---

<TOCInline toc={props.toc} asDisclosure />

## Introduction

So far, we've built a blockchain with Proof-of-Work (PoW) censensus, which allows
for mining. Our solution is coming closer to being a fully functional blockchain,
but it is still missing several key functionality. Today, we'll begin storing a
blockchain in a database, and then we'll create a simple command-line interface to
do blockchain activities. Blockchain is essentially a distributed database. For the
time being, we'll ignore the "distributed" aspect and concentrate on the "database"
component.

## Database Choice

In our current approach, there is no database; instead, we build blocks every time
we execute the program and keep them in memory. We cannot reuse a blockchain and
cannot share it with others, thus it must be stored on disk.

Which database do we require? Nothing in the
[original Bitcoin paper](https://bitcoin.org/bitcoin.pdf)
mentions utilizing a specific database, hence it is up to a developer to decide
which DB to use. [LevelDB](https://github.com/google/leveldb) is used by
[Bitcoin Core](https://github.com/bitcoin/bitcoin), which was first published by
Satoshi Nakamoto and is now a reference implementation of Bitcoin (although it was
introduced to the client only in 2012). And we'll employ...

## BoltDB

Because:

1. It's simple and minimalistic.
2. It's implemented in Go.
3. It doesn't require to run a server.
4. It allows to build the data structure we want.

From the BoltDB's [README on Github](https://github.com/boltdb/bolt):

> Bolt is a pure Go key/value store inspired by Howard Chu's LMDB project. The goal
> of the project is to provide a simple, fast, and reliable database for projects
> that don't require a full database server such as Postgres or MySQL.

> Since Bolt is meant to be used as such a low-level piece of functionality,
> simplicity is key. The API will be small and only focus on getting values and
> setting values. That's it.

Sounds perfect for our needs! Let's spend a minute reviewing it.

BoltDB is a key/value storage, which means there're no tables like in SQL RDBMS
(MySQL, PostgreSQL, etc.), no rows, no columns. Instead, data is stored as key-value
pairs (like in Golang maps). Key-value pairs are stored in buckets, which are
intended to group similar pairs (this is similar to tables in RDBMS). Thus, in order
to get a value, you need to know a bucket and a key.

## Database Structure

Before starting implementing persistence logic, we first need to decide how we'll
store data in the DB. And for this, we'll refer to the way Bitcoin Core does that.

In simple words, Bitcoin Core uses two "buckets" to store data:

1. `blocks` stores metadata describing all the blocks in a chain.
2. `chainstate` stores the state of a chain, which is all currently unspent
   transaction outputs and some metadata.

In `blocks`, the `key -> value` pairs are:

1. 'b' + 32-byte block hash -> block index record
2. 'f' + 4-byte file number -> file information record
3. 'l' -> 4-byte file number: the last block file number used
4. 'R' -> 1-byte boolean: whether we're in the process of reindexing
5. 'F' + 1-byte flag name length + flag name string -> 1 byte boolean: various
   flags that can be on or off
6. 't' + 32-byte transaction hash -> transaction index record

Since we don’t have transactions yet, we’re going to have only blocks bucket. Also,
as said above, we will store the whole DB as a single file, without storing blocks
in separate files. So we won’t need anything related to file numbers. So these are
key -> value pairs we’ll use:

1. 32-byte block-hash -> Block structure (serialized)
2. 'l' -> the hash of the last block in a chain

## Serialization

As said before, in BoltDB values can be only of `[]byte` type, and we want to store
`Block` structs in the DB. We’ll use
[encoding/gob](https://golang.org/pkg/encoding/gob/) to serialize the structs.

Let’s implement `Serialize` method of `Block`:

```go
// pkg/blockchain/block.go

func (b *Block) Serialize() []byte {
	var result bytes.Buffer

	encoder := gob.NewEncoder(&result)
	err := encoder.Encode(b)
	utils.Check(err)

	return result.Bytes()
}
```

Next, we need a deserializing function that will receive a byte array as input and
return a Block. This won’t be a method but an independent function:

```go
func DeserializeBlock(data []byte) *Block {
	var block Block

	decoder := gob.NewDecoder(bytes.NewReader(data))
	err := decoder.Decode(&block)
	utils.Check(err)

	return &block
}
```

And that’s it for the serialization!

## Persistence

Let’s start with the NewBlockchain function. Currently, it creates a new instance of
Blockchain and adds the genesis block to it. What we want it to do is to:

1. Open a DB file.
2. Check if there’s a blockchain stored in it.
3. If there’s a blockchain:
   1. Create a new Blockchain instance.
   2. Set the tip of the Blockchain instance to the last block hash stored in the DB.
4. If there’s no existing blockchain:
   1. Create the genesis block.
   2. Store in the DB.
   3. Save the genesis block’s hash as the last block hash.
   4. Create a new Blockchain instance with its tip pointing at the genesis block.

In code, it looks like this:

```go
// pkg/blockchain/blockchain.go

func NewBlockchain() *Blockchain {
	var tip []byte
	db, err := bolt.Open(dbFile, 0600, nil)
	utils.Check(err)

	err = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(blockBucket))

		if b == nil {
			fmt.Println("No existing blockchain found. Creating a new one...")
			genesis := NewGenesisBlock()
			b, err := tx.CreateBucket([]byte(blockBucket))
			utils.Check(err)
			err = b.Put(genesis.Hash, genesis.Serialize())
			utils.Check(err)
			err = b.Put([]byte("l"), genesis.Hash)
			utils.Check(err)
			tip = genesis.Hash
		} else {
			tip = b.Get([]byte("l"))
		}

		return nil
	})
	utils.Check(err)

	return &Blockchain{
		tip: tip,
		db:  db,
	}
}
```

We don’t store all the blocks in it anymore, instead only the tip of the chain is
stored. Also, we store a DB connection, because we want to open it once and keep it
open while the program is running. Thus, the Blockchain structure now looks like
this:

```go
// pkg/blockchain/blockchain.go

type Blockchain struct {
	tip []byte
	db  *bolt.DB
}
```

Next thing we want to update is the AddBlock method: adding blocks to a chain now is
not as easy as adding an element to an array. From now on we’ll store blocks in the
DB:

```go
func (bc *Blockchain) AddBlock(data string) {
	var lastHash []byte

	err := bc.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(blockBucket))
		lastHash = b.Get([]byte("l"))

		return nil
	})
	utils.Check(err)

	newBlock := NewBlock(data, lastHash)

	err = bc.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(blockBucket))
		err := b.Put(newBlock.Hash, newBlock.Serialize())
		utils.Check(err)
		err = b.Put([]byte("l"), newBlock.Hash)
		utils.Check(err)
		bc.tip = newBlock.Hash

		return nil
	})
	utils.Check(err)
}
```

## Inspecting Blockchain

All new blocks are now saved in a database, so we can reopen a blockchain and add a
new block to it. But after implementing this, we lost a nice feature: we cannot
print out blockchain blocks anymore because we don’t store blocks in an array any
longer. Let’s fix this flaw!

```go
// pkg/blockchain/blockchain_iterator.go

type BlockchainIterator struct {
	currentHash []byte
	db          *bolt.DB
}
```

An iterator will be created each time we want to iterate over blocks in a blockchain
and it’ll store the block hash of the current iteration and a connection to a DB.
Because of the latter, an iterator is logically attached to a blockchain (it’s a
Blockchain instance that stores a DB connection) and, thus, is created in a
Blockchain method:

```go
// pkg/blockchain/blockchain.go

func (bc *Blockchain) Iterator() *BlockchainIterator {
	return &BlockchainIterator{
		currentHash: bc.tip,
		db:          bc.db,
	}
}
```

BlockchainIterator will do only one thing: it’ll return the next block from a
blockchain.

```go
// pkg/blockchain/blockchain_iterator.go

func (bci *BlockchainIterator) Next() *Block {
	var block *Block

	err := bci.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(blockBucket))
		encodedBlock := b.Get([]byte(bci.currentHash))
		block = DeserializeBlock(encodedBlock)

		return nil
	})
	utils.Check(err)

	bci.currentHash = block.PrevBlockHash
	return block
}
```

## CLI

Until now our implementation hasn’t provided any interface to interact with the
program: we’ve simply executed NewBlockchain, bc.AddBlock in the main function.
Time to improve this! We want to have these commands:

All command-line related operations will be processed by the CLI struct:

```go
// pkg/cli/cli.go

type CLI struct {
	bc *blockchain.Blockchain
}

func NewCLI(bc *blockchain.Blockchain) *CLI {
	return &CLI{
		bc: bc,
	}
}
```

Its “entrypoint” is the Run function:

```go
// pkg/cli/cli.go

func (cli *CLI) Run() {
	cli.validateArgs()

	addBlockCmd := flag.NewFlagSet("addblock", flag.ExitOnError)
	printChainCmd := flag.NewFlagSet("printchain", flag.ExitOnError)

	addBlockData := addBlockCmd.String("data", "", "Block data")

	switch os.Args[1] {
	case "addblock":
		err := addBlockCmd.Parse(os.Args[2:])
		utils.Check(err)
	case "printchain":
		err := printChainCmd.Parse(os.Args[2:])
		utils.Check(err)
	default:
		cli.printUsage()
		os.Exit(1)
	}

	if addBlockCmd.Parsed() {
		if *addBlockData == "" {
			addBlockCmd.Usage()
			os.Exit(1)
		}
		cli.addBlock(*addBlockData)
	}

	if printChainCmd.Parsed() {
		cli.printChain()
	}
}
```

Next we implement the subcommands:

```go
// pkg/cli/cli_addblock.go

func (cli *CLI) addBlock(data string) {
	cli.bc.AddBlock(data)
	fmt.Println("Success!")
}
```

This piece is very similar to the one we had before. The only difference is that
we’re now using a BlockchainIterator to iterate over blocks in a blockchain.

```go
// pkg/cli/cli_printchain.go

func (cli *CLI) printChain() {
	bci := cli.bc.Iterator()

	for {
		block := bci.Next()

		fmt.Printf("Prev. hash: %x\n", block.PrevBlockHash)
		fmt.Printf("Data: %s\n", block.Data)
		fmt.Printf("Hash: %x\n", block.Hash)
		pow := blockchain.NewProofOfWork(block)
		fmt.Printf("PoW: %s\n", strconv.FormatBool(pow.Validate()))
		fmt.Println()

		if len(block.PrevBlockHash) == 0 {
			break
		}
	}
}
```

Also let’s not forget to modify the main function accordingly:

```go
// cmd/blockchain-go/main.go

func main() {
	bc := blockchain.NewBlockchain()
	defer bc.CloseDB()

	cli := cli.NewCLI(bc)
	cli.Run()
}
```

And that’s it! Let’s check that everything works as expected:

```sh
$ ./blockchain-go printchain
No existing blockchain found. Creating a new one...
Mining the block containing "Genesis Block"
00002c2baa7dc9fa82277212bb29a8103e4b219aff6e272a949ebefb0d76280b

Prev. hash:
Data: Genesis Block
Hash: 00002c2baa7dc9fa82277212bb29a8103e4b219aff6e272a949ebefb0d76280b
PoW: true

$ ./blockchain-go addblock -data "Send 1 BTC to Ivan"
Mining the block containing "Send 1 BTC to Ivan"
000018fd1d923aa8719770e6d455ad5875fe24d042f003f2197d1472d9b116ff

Success!

$ ./blockchain-go addblock -data "Pay 0.31337 BTC for a coffee"
Mining the block containing "Pay 0.31337 BTC for a coffee"
00002f76edb46270f180a03f192e0c2a41eeae083569973fa5d3dcd9818d76e3

Success!

$ ./blockchain-go printchain
Prev. hash: 000018fd1d923aa8719770e6d455ad5875fe24d042f003f2197d1472d9b116ff
Data: Pay 0.31337 BTC for a coffee
Hash: 00002f76edb46270f180a03f192e0c2a41eeae083569973fa5d3dcd9818d76e3
PoW: true

Prev. hash: 00002c2baa7dc9fa82277212bb29a8103e4b219aff6e272a949ebefb0d76280b
Data: Send 1 BTC to Ivan
Hash: 000018fd1d923aa8719770e6d455ad5875fe24d042f003f2197d1472d9b116ff
PoW: true

Prev. hash:
Data: Genesis Block
Hash: 00002c2baa7dc9fa82277212bb29a8103e4b219aff6e272a949ebefb0d76280b
PoW: true
```

## Conclusion

Next time we’ll implement addresses, wallets, and (probably) transactions. So stay tuned!

**References:**

[Full Source Code](https://github.com/noodleslove/blockchain-go/tree/part_3)

[Bitcoin Core](<https://en.bitcoin.it/wiki/Bitcoin_Core_0.11_(ch_2):_Data_Storage>)

[boltdb](https://github.com/boltdb/bolt)

[encoding/gob](https://pkg.go.dev/encoding/gob)

[flag](https://golang.org/pkg/flag/)
