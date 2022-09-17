---
title: 'Building blockchain in Go. Part 6: Transactions 2'
date: '2022-09-16'
tags: ['blockchain', 'code', 'go']
lastmod: '2022-09-16'
draft: true
summary: In this series of articles we’ll build a simplified cryptocurrency that’s based on a simple blockchain implementation.
authors: ['eddieho']
---

<TOCInline toc={props.toc} asDisclosure />

## Introduction

In the very first part of this series I said that blockchain is a distributed database. Back then, we decided to skip the “distributed” part and focus on the “database” part. So far, we’ve implemented almost all the things that make a blockchain database. In this post, we’ll cover some mechanisms that were skipped in the previous parts, and in the next part we’ll start working on the distributed nature of blockchain.

Previous parts:

1. [Basic Prototype](https://edwinho.online/blog/blockchain-in-go/part-1)
2. [Proof-of-Work](https://edwinho.online/blog/blockchain-in-go/part-2)
3. [Persistence & CLI](https://edwinho.online/blog/blockchain-in-go/part-3)
4. [Transactions 1](https://edwinho.online/blog/blockchain-in-go/part-4)
5. [Addresses](https://edwinho.online/blog/blockchain-in-go/part-5)

> This part introduces significant code changes, so it makes no sense explaining all of them here. Please refer to [this page](https://github.com/noodleslove/blockchain-go/pull/7/files) to see all the changes since the last article.

## Reward

One tiny thing we skipped in a previous article is rewards for mining. And we already have everything to implement it.

The reward is just a coinbase transaction. When a mining node starts mining a new block, it takes transactions from the queue and prepends a coinbase transaction to them. The coinbase transaction’s only output contains miner’s public key hash.

Implementing rewards is as easy as updating the `send` command:

```go
// pkg/cli/cli_send.go

func (cli *CLI) send(from, to string, amount int) {
    ...
    bc := blockchain.NewBlockchain()
    UTXOSet := blockchain.UTXOSet{bc}
    defer bc.db.Close()

    tx := blockchain.NewUTXOTransaction(from, to, amount, &UTXOSet)
    cbTx := blockchain.NewCoinbaseTX(from, "")
    txs := []*blockchain.Transaction{cbTx, tx}

    newBlock := bc.MineBlock(txs)
    fmt.Println("Success!")
}
```

In our implementation, the one who creates a transaction mines the new block, and thus, receives a reward.

## The UTXO Set

In [Part 3: Persistence and CLI](https://edwinho.online/blog/blockchain-in-go/part-3) we studied the way Bitcoin Core stores blocks in a database. It was said that blocks are stored in `blocks` database and transaction outputs are stored in `chainstate` database. Let me remind you what the structure of `chainstate` is:

1. 'c' + 32-byte transaction hash -> unspent transaction output record for that transaction
2. 'B' -> 32-byte block hash: the block hash up to which the database represents the unspent transaction outputs

Since that article, we’ve already implemented transactions, but we haven’t used the `chainstate` to store their outputs. So, this is what we’re going to do now.

`chainstate` doesn’t store transactions. Instead, it stores what is called the UTXO set, or the set of unspent transaction outputs. Besides this, it stores “the block hash up to which the database represents the unspent transaction outputs”, which we’ll omit for now because we’re not using block heights (but we’ll implement them in next articles).

So, why do we want to have the UTXO set?

Consider the `Blockchain.FindUnspentTransactions` method we’ve implemented earlier:

```go
// pkg/blockchain/blockchain.go

func (bc *Blockchain) FindUnspentTransactions(pubKeyHash []byte) []Transaction {
    ...
    bci := bc.Iterator()

    for {
        block := bci.Next()

        for _, tx := range block.Transactions {
            ...
        }

        if len(block.PrevBlockHash) == 0 {
            break
        }
    }
    ...
}
```

The function finds transactions with unspent outputs. Since transactions are stored in blocks, it iterates over each block in the blockchain and checks every transaction in it. As of September 18, 2017, there’re 485,860 blocks in Bitcoin and the whole database takes 140+ Gb of disk space. This means that one has to run a full node to validate transactions. Moreover, validating transactions would require iterating over many blocks.

The solution to the problem is to have an index that stores only unspent outputs, and this is what the UTXO set does: this is a cache that is built from all blockchain transactions (by iterating over blocks, yes, but this is done only once), and is later used to calculate balance and validate new transactions. The UTXO set is about 2.7 Gb as of September 2017.

Alright, let’s think what we need to change to implement the UTXO set. Currently, the following methods are used to find transactions:

1. `Blockchain.FindUnspentTransactions` – the main function that finds transactions with unspent outputs. It’s this function where the iteration of all blocks happens.
1. `Blockchain.FindSpendableOutputs` – this function is used when a new transaction is created. If finds the enough number of outputs holding required amount. Uses `Blockchain.FindUnspentTransactions`.
1. `Blockchain.FindUTXO` – finds unspent outputs for a public key hash, used to get balance. Uses `Blockchain.FindUnspentTransactions`.
1. `Blockchain.FindTransaction` – finds a transaction in the blockchain by its ID. It iterates over all blocks until finds it.

As you can see, all the methods iterate over blocks in the database. But we cannot improve all of them for now, because the UTXO set doesn’t store all transactions, but only those that have unspent outputs. Thus, it cannot be used in `Blockchain.FindTransaction`.

So, we want the following methods:

1. `Blockchain.FindUTXO` – finds all unspent outputs by iterating over blocks.
1. `UTXOSet.Reindex` — uses FindUTXO to find unspent outputs, and stores them in a database. This is where caching happens.
1. `UTXOSet.FindSpendableOutputs` – analog of `Blockchain.FindSpendableOutputs`, but uses the UTXO set.
1. `UTXOSet.FindUTXO` – analog of `Blockchain.FindUTXO`, but uses the UTXO set.
1. `Blockchain.FindTransaction` remains the same.

Thus, the two most frequently used functions will use the cache from now! Let’s start coding.

```go
// pkg/blockchain/utxo_set.go

type UTXOSet struct {
	Blockchain *Blockchain
}
```

We’ll use a single database, but we’ll store the UTXO set in a different bucket. Thus, `UTXOSet` is coupled with `Blockchain`.

```go
// pkg/blockchain/utxo_set.go

// Reindex rebuilds the UTXO set
func (u UTXOSet) Reindex() {
	db := u.Blockchain.db
	bucketName := []byte(internal.UtxoBucket)

	err := db.Update(func(tx *bolt.Tx) error {
		tx.DeleteBucket(bucketName)
		_, err := tx.CreateBucket(bucketName)

		return err
	})
	utils.Check(err)

	UTXO := u.Blockchain.FindUTXO()

	err = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketName)

		for txID, outs := range UTXO {
			key, err := hex.DecodeString(txID)
			utils.Check(err)
			err = b.Put(key, outs.Serialize())
			utils.Check(err)
		}

		return nil
	})
	utils.Check(err)
}
```

This method creates the UTXO set initially. First, it removes the bucket if it exists, then it gets all unspent outputs from blockchain, and finally it saves the outputs to the bucket.

`Blockchain.FindUTXO` is almost identical to `Blockchain.FindUnspentTransactions`, but now it returns a map of `TransactionID → TransactionOutputs` pairs.

Now, the UTXO set can be used to send coins:

```go
// pkg/blockchain/utxo_set.go

// FindSpendableOutputs finds and returns unspent outputs to reference in inputs
func (u *UTXOSet) FindSpendableOutputs(
	pubKeyHash []byte,
	amount int,
) (int, map[string][]int) {
	unspentOutputs := make(map[string][]int)
	accumlated := 0
	db := u.Blockchain.db

	err := db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(internal.UtxoBucket))
		c := b.Cursor()

		for k, v := c.First(); k != nil; k, v = c.Next() {
			txID := hex.EncodeToString(k)
			outs := DeserializeOutputs(v)

			for outIdx, out := range outs.Outputs {
				if out.IsLockedWithKey(pubKeyHash) && accumlated < amount {
					accumlated += out.Value
					unspentOutputs[txID] = append(unspentOutputs[txID], outIdx)
				}
			}
		}

		return nil
	})
	utils.Check(err)

	return accumlated, unspentOutputs
}
```

Or check balance:

```go
// pkg/blockchain/utxo_set.go

// FindUTXO finds UTXO for a public key hash
func (u *UTXOSet) FindUTXO(pubKeyHash []byte) []TXOutput {
	var UTXOs []TXOutput
	db := u.Blockchain.db

	err := db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(internal.UtxoBucket))
		c := b.Cursor()

		for k, v := c.First(); k != nil; k, v = c.Next() {
			outs := DeserializeOutputs(v)

			for _, out := range outs.Outputs {
				if out.IsLockedWithKey(pubKeyHash) {
					UTXOs = append(UTXOs, out)
				}
			}
		}

		return nil
	})
	utils.Check(err)

	return UTXOs
}
```

These are slightly modified versions of corresponding Blockchain methods. Those Blockchain methods are not needed anymore.

Having the UTXO set means that our data (transactions) are now split into to storages: actual transactions are stored in the blockchain, and unspent outputs are stored in the UTXO set. Such separation requires solid synchronization mechanism because we want the UTXO set to always be updated and store outputs of most recent transactions. But we don’t want to reindex every time a new block is mined because it’s these frequent blockchain scans that we want to avoid. Thus, we need a mechanism of updating the UTXO set:

```go
// pkg/blockchain/utxo_set.go

// Update updates the UTXO set with transactions from the Block
// The Block is considered to be the tip of a blockchain
func (u *UTXOSet) Update(block *Block) {
	db := u.Blockchain.db

	err := db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(internal.UtxoBucket))

		for _, tx := range block.Transactions {
			if !tx.IsCoinbase() {
				for _, vin := range tx.Vin {
					updateOuts := TXOutputs{}
					outsBytes := b.Get(vin.Txid)
					outs := DeserializeOutputs(outsBytes)

					// Put unspent outputs into updateOuts
					for outIdx, out := range outs.Outputs {
						if outIdx != vin.Vout {
							updateOuts.Outputs = append(updateOuts.Outputs, out)
						}
					}

					// Remove pair if all outputs are spent, otherwise save the
					// updated one
					if len(updateOuts.Outputs) == 0 {
						err := b.Delete(vin.Txid)
						utils.Check(err)
					} else {
						err := b.Put(vin.Txid, updateOuts.Serialize())
						utils.Check(err)
					}
				}
			}

			// Insert outputs of newly mined transactions
			newOutputs := TXOutputs{}
			newOutputs.Outputs = append(newOutputs.Outputs, tx.Vout...)

			err := b.Put(tx.ID, newOutputs.Serialize())
			utils.Check(err)
		}

		return nil
	})
	utils.Check(err)
}
```

The method looks big, but what it does is quite straightforward. When a new block is mined, the UTXO set should be updated. Updating means removing spent outputs and adding unspent outputs from newly mined transactions. If a transaction which outputs were removed, contains no more outputs, it’s removed as well. Quite simple!

Let’s now use the UTXO set where it’s necessary:

```go
// pkg/cli/cli_createblockchain.go

func (cli *CLI) createBlockchain(address string) {
    ...
	bc := blockchain.CreateBlockchain(address)
	defer bc.CloseDB()

	utxoSet := blockchain.UTXOSet{Blockchain: bc}
	utxoSet.Reindex()
    ...
}
```

Reindexing happens right after a new blockchain is created. For now, this is the only place where `Reindex` is used, even though it looks excessive here because in the beginning of a blockchain there’s only one block with one transaction, and `Update` could’ve been used instead. But we might need the reindexing mechanism in the future.

```go
// pkg/cli/cli_send.go

func (cli *CLI) send(from, to string, amount int) {
    ...
    newBlock := bc.MineBlock(txs)
    UTXOSet.Update(newBlock)
}
```

And the UTXO set is updated after a new block is mined.

Let’s check that it works

## Merkle Tree

## Conclusion

**References:**

[Full source code](https://edwinho.online/blog/blockchain-in-go/part-6)

[Blockchain in Go](https://jeiwan.net/posts/building-blockchain-in-go-part-6/)
