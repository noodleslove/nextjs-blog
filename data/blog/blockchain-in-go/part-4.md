---
title: 'Building blockchain in Go. Part 4: Transactions 1'
date: '2022-09-04'
tags: ['blockchain', 'code', 'go']
lastmod: '2022-09-04'
draft: false
summary: In this series of articles we’ll build a simplified cryptocurrency that’s based on a simple blockchain implementation.
authors: ['eddieho']
---

<TOCInline toc={props.toc} asDisclosure />

## Introduction

Transactions are the heart of Bitcoin and the only purpose of blockchain is to store transactions in a secure and reliable way, so no one could modify them after they are created. Today we’re starting implementing transactions. But because this is quite a big topic, I’ll split it into two parts: in this part, we’ll implement the general mechanism of transactions and in the second part we’ll work through details.

Also, since code changes are massive, it makes no sense describing all of them here. You can see all the changes here.

## Bitcoin Transaction

A transaction is a combination of inputs and outputs:

```go
// pkg/transaction/transaction.go

type Transaction struct {
	ID   []byte
	Vin  []TXInput
	Vout []TXOutput
}
```

Inputs of a new transaction reference outputs of a previous transaction (there’s an exception though, which we’ll discuss later). Outputs are where coins are actually stored. The following diagram demonstrates the interconnection of transactions:

Notice that:

1. There are outputs that are not linked to inputs.
2. In one transaction, inputs can reference outputs from multiple transactions.
3. An input must reference an output.

Throughout this article, we’ll use words like “money”, “coins”, “spend”, “send”, “account”, etc. But there are no such concepts in Bitcoin. Transactions just lock values with a script, which can be unlocked only by the one who locked them.

## Transaction Outputs

Let’s start with outputs first:

```go
// pkg/transaction/transaction_output.go

type TXOutput struct {
	Value        int
	ScriptPubKey string
}
```

Actually, it’s outputs that store “coins” (notice the Value field above). And storing means locking them with a puzzle, which is stored in the ScriptPubKey. Internally, Bitcoin uses a scripting language called Script, that is used to define outputs locking and unlocking logic. The language is quite primitive (this is made intentionally, to avoid possible hacks and misuses), but we won’t discuss it in details. You can find a detailed explanation of it
[here](https://en.bitcoin.it/wiki/Script).

> In Bitcoin, the value field stores the number of satoshis, not the number of BTC. A satoshi is a hundred millionth of a bitcoin (0.00000001 BTC), thus this is the smallest unit of currency in Bitcoin (like a cent).

Since we don’t have addresses implemented, we’ll avoid the whole scripting related logic for now. `ScriptPubKey` will store an arbitrary string (user defined wallet address).

> By the way, having such scripting language means that Bitcoin can be used as a smart-contract platform as well.

One important thing about outputs is that they are **indivisible**, which means that you cannot reference a part of its value. When an output is referenced in a new transaction, it’s spent as a whole. And if its value is greater than required, a change is generated and sent back to the sender. This is similar to a real world situation when you pay, say, a $5 banknote for something that costs $1 and get a change of $4.

## Transaction Inputs

And here’s the input:

```go
// pkg/transaction/transaction_input.go

type TXInput struct {
	Txid      []byte
	Vout      int
	ScriptSig string
}
```

As mentioned earlier, an input references a previous output: `Txid` stores the ID of such transaction, and `Vout` stores an index of an output in the transaction. ScriptSig is a script which provides data to be used in an output’s `ScriptPubKey`. If the data is correct, the output can be unlocked, and its value can be used to generate new outputs; if it’s not correct, the output cannot be referenced in the input. This is the mechanism that guarantees that users cannot spend coins belonging to other people.

Again, since we don’t have addresses implemented yet, `ScriptSig` will store just an arbitrary user defined wallet address. We’ll implement public keys and signatures checking in the next article.

Let’s sum it up. Outputs are where “coins” are stored. Each output comes with an unlocking script, which determines the logic of unlocking the output. Every new transaction must have at least one input and output. An input references an output from a previous transaction and provides data (the `ScriptSig` field) that is used in the output’s unlocking script to unlock it and use its value to create new outputs.

But what came first: inputs or outputs?

## Storing Transactions in Blockchain

```go
// pkg/blockchain/block.go

type Block struct {
	Timestamp     int64
	Transactions  []*transaction.Transaction
	PrevBlockHash []byte
	Hash          []byte
	Nonce         int
}
```

`NewBlock` and `NewGenesisBlock` also must be changed accordingly:

```go
// pkg/blockchain/block.go

func NewBlock(
    transactions []*transaction.Transaction,
    prevBlockHash []byte,
) *Block {
	block := &Block{
		Timestamp:     time.Now().Unix(),
		Transactions:  transactions,
		PrevBlockHash: prevBlockHash,
		Hash:          []byte{},
		Nonce:         0,
	}
    ...
}

func NewGenesisBlock(coinbase *transaction.Transaction) *Block {
	return NewBlock([]*transaction.Transaction{coinbase}, []byte{})
}
```

Next thing to change is the creation of a new blockchain:

```go
// pkg/blockchain/blockchain.go

func CreateBlockchain(address string) *Blockchain {
	if dbExists() {
		fmt.Println("Blockchain already exists.")
		os.Exit(1)
	}

	var tip []byte
	db, err := bolt.Open(dbFile, 0600, nil)
	utils.Check(err)

	err = db.Update(func(tx *bolt.Tx) error {
		cbtx := transaction.NewCoinbaseTX(address, genesisData)
		genesis := NewGenesisBlock(cbtx)
		b, err := tx.CreateBucket([]byte(blockBucket))
		utils.Check(err)
		err = b.Put([]byte(genesis.Hash), genesis.Serialize())
		utils.Check(err)
		err = b.Put([]byte("l"), genesis.Hash)
		utils.Check(err)
		tip = genesis.Hash

		return nil
	})
	utils.Check(err)

	return &Blockchain{
		tip: tip,
		db:  db,
	}
}
```

Now, the function takes an address which will receive the reward for mining the genesis block.

## Proof-of-Work

The Proof-of-Work algorithm must consider transactions stored in a block, to guarantee the consistency and reliability of blockchain as a storage of transaction. So now we must modify the `ProofOfWork.prepareData` method:

```go
// pkg/blockchain/proofofwork.go

func (pow *ProofOfWork) prepareData(nonce int) []byte {
	data := bytes.Join(
		[][]byte{
			pow.block.PrevBlockHash,
			pow.block.HashTransactions(), // this line was changed
			utils.IntToHex(pow.block.Timestamp),
			utils.IntToHex(int64(targetBits)),
			utils.IntToHex(int64(nonce)),
		},
		[]byte{},
	)

	return data
}
```

Instead of `pow.block.Data` we now use `pow.block.HashTransactions()` which is:

```go
// pkg/blockchain/block.go

func (b *Block) HashTransactions() []byte {
	var txHashes [][]byte
	var txHash [32]byte

	for _, tx := range b.Transactions {
		txHashes = append(txHashes, tx.ID)
	}
	txHash = sha256.Sum256(bytes.Join(txHashes, []byte{}))

	return txHash[:]
}
```

Again, we’re using hashing as a mechanism of providing unique representation of data. We want all transactions in a block to be uniquely identified by a single hash. To achieve this, we get hashes of each transaction, concatenate them, and get a hash of the concatenated combination.

> Bitcoin uses a more elaborate technique: it represents all transactions containing in a block as a [Merkle tree](https://en.wikipedia.org/wiki/Merkle_tree) and uses the root hash of the tree in the Proof-of-Work system. This approach allows to quickly check if a block contains certain transaction, having only just the root hash and without downloading all the transactions.

Let’s check that everything is correct so far:

```shell
$ ./blockchain-go createblockchain -address Eddie
00000fef595defd96bfd8f25e2c868d21a94b4ef42ca49323416e2d7853b9068

Done!
```

Good! We received out first mining reward. But how do we check the balance?

## Unspent Transaction Outputs

We need to find all unspent transaction outputs (UTXO). Unspent means that these outputs weren’t referenced in any inputs. On the diagram above, these are:

1. tx0, output 1;
2. tx1, output 0;
3. tx3, output 0;
4. tx4, output 0.

Of course, when we check balance, we don’t need all of them, but only those that can be unlocked by the key we own (currently we don’t have keys implemented and will use user defined addresses instead). First, let’s define locking-unlocking methods on inputs and outputs:

```go
// pkg/transaction/transaction_output.go

func (out *TXOutput) CanBeUnlockedWith(unlockingData string) bool {
	return out.ScriptPubKey == unlockingData
}
```

```go
// pkg/transaction/transaction_input.go

func (out *TXOutput) CanBeUnlockedWith(unlockingData string) bool {
	return out.ScriptPubKey == unlockingData
}
```

Here we just compare the script fields with unlockingData. These pieces will be improved in a future article, after we implement addresses based on private keys.

The next step - finding transactions containing unspent outputs - is quite difficult:

```go
// pkg/blockchain/blockchain.go

func (bc *Blockchain) FindUnspentTransactions(address string) []transaction.Transaction {
	var unspentTXs []transaction.Transaction
	spentTXOs := make(map[string][]int)
	bci := bc.Iterator()

	for {
		block := bci.Next()

		for _, tx := range block.Transactions {
			txID := hex.EncodeToString(tx.ID)

		Outputs:
			for outIdx, out := range tx.Vout {
				// Check if an output was already referenced in an input
				if spentTXOs[txID] != nil {
					for _, spentOut := range spentTXOs[txID] {
						if spentOut == outIdx {
							continue Outputs
						}
					}
				}

				// If an output was locked by the same pubkey hash, this is the
				// output we want
				if out.CanBeUnlockedWith(address) {
					unspentTXs = append(unspentTXs, *tx)
				}
			}

			// After checking outputs we gather all inputs that could unlock
			// outputs locked with the provided address (this doesn't apply to
			// coinbase transactions, since they don't unlock outputs)
			if !tx.IsCoinbase() {
				for _, in := range tx.Vin {
					if in.CanUnlockOutputWith(address) {
						inTxID := hex.EncodeToString(in.Txid)
						spentTXOs[inTxID] = append(spentTXOs[inTxID], in.Vout)
					}
				}
			}
		}

		if len(block.PrevBlockHash) == 0 {
			break
		}
	}

	return unspentTXs
}
```

The function returns a list of transactions containing unspent outputs. To calculate balance we need one more function that takes the transactions and returns only outputs:

```go
// pkg/blockchain/blockchain.go

func (bc *Blockchain) FindUTXO(address string) []transaction.TXOutput {
	var UTXOs []transaction.TXOutput
	unspentTransactions := bc.FindUnspentTransactions(address)

	for _, tx := range unspentTransactions {
		for _, out := range tx.Vout {
			if out.CanBeUnlockedWith(address) {
				UTXOs = append(UTXOs, out)
			}
		}
	}

	return UTXOs
}
```

That’s it! Now we can implement `getbalance` command:

```go
// pkg/cli/cli_getbalance.go

func (cli *CLI) getBalance(address string) {
	bc := blockchain.NewBlockchain()
	defer bc.CloseDB()

	balance := 0
	UTXOs := bc.FindUTXO(address)

	for _, out := range UTXOs {
		balance += out.Value
	}

	fmt.Printf("Balance of '%s': %d\n", address, balance)
}
```

The account balance is the sum of values of all unspent transaction outputs locked by the account address.

Let’s check our balance after mining the genesis block:

```shell
$ ./blockchain-go getbalance -address Eddie
Balance of 'Eddie': 10
```

This is our first money!

## Sending Coins

Now, we want to send some coins to someone else. For this, we need to create a new transaction, put it in a block, and mine the block. So far, we implemented only the coinbase transaction (which is a special type of transactions), now we need a general transaction:

```go
// pkg/transaction/transaction.go

func NewUTXOTransaction(from, to string, amount int, bc blockchain) *Transaction {
	var inputs []TXInput
	var outputs []TXOutput

	acc, validOutputs := bc.FindSpendableOutputs(from, amount)
	if acc < amount {
		log.Panic("ERROR: Not enough funds")
	}

	// Build a list of inputs
	for txid, outs := range validOutputs {
		txID, err := hex.DecodeString(txid)
		utils.Check(err)

		for _, out := range outs {
			input := TXInput{txID, out, from}
			inputs = append(inputs, input)
		}
	}

	// Build a list of outputs
	outputs = append(outputs, TXOutput{amount, to})
	if acc > amount {
		outputs = append(outputs, TXOutput{acc - amount, from}) // a change
	}

	tx := Transaction{
		ID:   nil,
		Vin:  inputs,
		Vout: outputs,
	}
	tx.SetID()

	return &tx
}
```

Before creating new outputs, we first have to find all unspent outputs and ensure that they store enough value. This is what `FindSpendableOutputs` method does. After that, for each found output an input referencing it is created. Next, we create two outputs:

1. One that’s locked with the receiver address. This is the actual transferring of coins to other address.
2. One that’s locked with the sender address. This is a change. It’s only created when unspent outputs hold more value than required for the new transaction. Remember: outputs are **indivisible**.

`FindSpendableOutputs` method is based on the `FindUnspentTransactions` method we defined earlier:

```go
// pkg/blockchain/blockchain.go

func (bc *Blockchain) FindSpendableOutputs(
	address string,
	amount int,
) (int, map[string][]int) {
	unspentOutputs := make(map[string][]int)
	unspentTXs := bc.FindUnspentTransactions(address)
	accumulated := 0

Outputs:
	for _, tx := range unspentTXs {
		txID := hex.EncodeToString(tx.ID)

		for outIdx, out := range tx.Vout {
			if out.CanBeUnlockedWith(address) && accumulated < amount {
				accumulated += out.Value
				unspentOutputs[txID] = append(unspentOutputs[txID], outIdx)

				if accumulated >= amount {
					break Outputs
				}
			}
		}
	}

	return accumulated, unspentOutputs
}
```

The method iterates over all unspent transactions and accumulates their values. When the accumulated value is more or equals to the amount we want to transfer, it stops and returns the accumulated value and output indices grouped by transaction IDs. We don’t want to take more than we’re going to spend.

Now we can modify the `Blockchain.MineBlock` method:

```go
// pkg/blockchain/blockchain.go

func (bc *Blockchain) MineBlock(transactions []*transaction.Transaction) {
    ...
    newBlock := NewBlock(transactions, lastHash)
    ...
}
```

Finally, let’s implement send command:

```go
// pkg/cli/cli_send.go

func (cli *CLI) send(from, to string, amount int) {
	bc := blockchain.NewBlockchain()
	defer bc.CloseDB()

	tx := transaction.NewUTXOTransaction(from, to, amount, bc)
	bc.MineBlock([]*transaction.Transaction{tx})
	fmt.Println("Success!")
}
```

Sending coins means creating a transaction and adding it to the blockchain via mining a block. But Bitcoin doesn’t do this immediately (as we do). Instead, it puts all new transactions into memory pool (or mempool), and when a miner is ready to mine a block, it takes all transactions from the mempool and creates a candidate block. Transactions become confirmed only when a block containing them is mined and added to the blockchain.

Let’s check that sending coins works:

```shell
$ ./blockchain-go send -from Eddie -to Ivan -amount 6
00001983a86b8677e463de7d1c4643a120a0f250e962ded0a0f6cfbb11e441c8

Success!

$ ./blockchain-go getbalance -address Eddie
Balance of 'Eddie': 4

$ ./blockchain-go getbalance -address Ivan
Balance of 'Ivan': 6
```

Nice! Now, let’s create more transactions and ensure that sending from multiple outputs works fine:

```shell
$ ./blockchain-go send -from Eddie -to Rachel -amount 2
00000121221e75f32f9411ac6baefe14e16ed234f2fa8106ed7bb7038523909e

Success!

$ ./blockchain-go send -from Ivan -to Rachel -amount 2
000030ded038b4f226b1a08124fa74addac7f59b23eaca31c98c71b14b1436c7

Success!
```

Looks fine! Now let’s test a failure:

```shell
$ ./blockchain-go send -from Eddie -to Rachel -amount 3
2022/09/04 15:50:30 ERROR: Not enough funds
panic: ERROR: Not enough funds
...

$ ./blockchain-go getbalance -address Eddie
Balance of 'Eddie': 2
```

## Conclusion

Phew! It wasn’t easy, but we have transactions now! Although, some key features of a Bitcoin-like cryptocurrency are missing:

1. Addresses. We don’t have real, private key based addresses yet.
2. Rewards. Mining blocks is absolutely not profitable!
3. UTXO set. Getting balance requires scanning the whole blockchain, which can take very long time when there are many and many blocks. Also, it can take a lot of time if we want to validate later transactions. UTXO set is intended to solve these problems and make operations with transactions fast.
4. Mempool. This is where transactions are stored before being packed in a block. In our current implementation, a block contains only one transaction, and this is quite inefficient.

**References:**

[Full source code](https://github.com/noodleslove/blockchain-go/tree/part_4)

[Transaction](https://en.bitcoin.it/wiki/Transaction)

[Merklee tree](https://en.bitcoin.it/wiki/Protocol_documentation#Merkle_Trees)

[Coinbase](https://en.bitcoin.it/wiki/Coinbase)

[Building Blockchain in Go](https://jeiwan.net/posts/building-blockchain-in-go-part-4/)
