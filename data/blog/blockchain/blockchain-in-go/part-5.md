---
title: 'Building blockchain in Go. Part 5: Addresses'
date: '2022-09-07'
tags: ['blockchain', 'code', 'go']
lastmod: '2022-09-08'
draft: false
summary: In this series of articles we’ll build a simplified cryptocurrency that’s based on a simple blockchain implementation.
authors: ['eddieho']
---

<TOCInline toc={props.toc} asDisclosure />

## Introduction

In the [previous article](https://edwinho.online/blog/blockchain-in-go/part-4), we started implementing transactions. You were also introduced to the impersonal nature of transactions: there are no user accounts, your personal data (e.g., name, passport number or SSN) is not required and not stored anywhere in Bitcoin. But there still must be something that identifies you as the owner of transaction outputs (i.e. the owner of coins locked on these outputs). And this is what Bitcoin addresses are needed for. So far we’ve used arbitrary user defined strings as addresses, and the time has come to implement real addresses, as they’re implemented in Bitcoin.

> This part introduces significant code changes, so it makes no sense explaining all of them here. Please refer to [this page](https://github.com/noodleslove/blockchain-go/pull/5/files) to see all the changes since the last article.

## Bitcoin Address

Here’s an example of a Bitcoin address: [1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa](https://www.blockchain.com/btc/address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa). This is the very first Bitcoin address, which allegedly belongs to Satoshi Nakamoto. Bitcoin addresses are public. If you want to send coins to someone, you need to know their address. But addresses (despite being unique) are not something that identifies you as the owner of a “wallet”. In fact, such addresses are a human readable representation of public keys. In Bitcoin, your identity is a pair (or pairs) of private and public keys stored on your computer (or stored in some other place you have access to). Bitcoin relies on a combination of cryptography algorithms to create these keys, and guarantee that no one else in the world can access your coins without getting physical access to your keys. Let’s discuss what these algorithms are.

## Public-key Cryptography

Public-key cryptography algorithms use pairs of keys: public keys and private keys. Public keys are not sensitive and can be disclosed to anyone. In contrast, private keys shouldn’t be disclosed: no one but the owner should have access to them because it’s private keys that serve as the identifier of the owner. You are your private keys (in the world of cryptocurrencies, of course).

In essence, a Bitcoin wallet is just a pair of such keys. When you install a wallet application or use a Bitcoin client to generate a new address, a pair of keys is generated for you. The one who controls the private key controls all the coins sent to this key in Bitcoin.

Private and public keys are just random sequences of bytes, thus they cannot be printed on the screen and read by a human. That’s why Bitcoin uses an algorithm to convert public keys into a human readable string.

> If you’ve ever used a Bitcoin wallet application, it’s likely that a mnemonic pass phrase was generated for you. Such phrases are used instead of private keys and can be used to generate them. This mechanism is implemented in [BIP-039](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).

Ok, we now know what identifies users in Bitcoin. But how does Bitcoin check the ownership of transaction outputs (and coins stored on them)?

## Digital Signature

In mathematics and cryptography, there’s a concept of digital signature – algorithms that guarantee:

1. that data wasn’t modified while being transferred from a sender to a recipient
2. that data was created by a certain sender
3. that the sender cannot deny sending the data

By applying a signing algorithm to data (i.e., signing the data), one gets a signature, which can later be verified. Digital signing happens with the usage of a private key, and verification requires a public key.

In order to sign data we need the following things:

1. data to sign
2. private key

The operation of signing produces a signature, which is stored in transaction inputs. In order to verify a signature, the following is required:

1. data that was signed
2. the signature
3. public key

In simple terms, the verification process can be described as: check that this signature was obtained from this data with a private key used to generate the public key.

> Digital signatures are not encryption, you cannot reconstruct the data from a signature. This is similar to hashing: you run data through a hashing algorithm and get a unique representation of the data. The difference between signatures and hashes is key pairs: they make signature verification possible.
> But key pairs can also be used to encrypt data: a private key is used to encrypt, and a public key is used to decrypt the data. Bitcoin doesn’t use encryption algorithms though.

## Elliptic Curve Cryptography

As described above, public and private keys are sequences of random bytes. Since it’s private keys that are used to identify owners of coins, there’s a required condition: the randomness algorithm must produce truly random bytes. We don’t want to accidentally generate a private key that’s owned by someone else.

Bitcoin uses elliptic curves to generate private keys. Elliptic curves is a complex mathematical concept, which we’re not going to explain in details here (if you’re curious, check out [this gentle introduction to elliptic curves](http://andrea.corbellini.name/2015/05/17/elliptic-curve-cryptography-a-gentle-introduction/) WARNING: Math formulas!). What we need to know is that these curves can be used to generate really big and random numbers. The curve used by Bitcoin can randomly pick a number between 0 and 2²⁵⁶ (which is approximately 10⁷⁷, when there are between 10⁷⁸ and 10⁸² atoms in the visible universe). Such a huge upper limit means that it’s almost impossible to generate the same private key twice.

Also, Bitcoin uses (and we will) ECDSA (Elliptic Curve Digital Signature Algorithm) algorithm to sign transactions.

## Base58

Now let’s get back to the above mentioned Bitcoin address: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa. Now we know that this is a human-readable representation of a public key. And if we decode it, here’s what the public key looks like (as a sequence of bytes written in the hexadecimal system):

```shell
0062E907B15CBF27D5425399EBF6F0FB50EBB88F18C29B7D93
```

Bitcoin uses the Base58 algorithm to convert public keys into human readable format. The algorithm is very similar to famous Base64, but it uses shorter alphabet: some letters were removed from the alphabet to avoid some attacks that use letters similarity. Thus, there are no these symbols: 0 (zero), O (capital o), I (capital i), l (lowercase L), because they look similar. Also, there are no + and / symbols.

## Implementing Addresses

We’ll start with the Wallet structure:

```go
// pkg/wallet/wallet.go

type Wallet struct {
	PrivateKey ecdsa.PrivateKey
	PublicKey  []byte
}

// Returns a new wallet
func NewWallet() *Wallet {
	private, public := newKeyPair()
	return &Wallet{
		PrivateKey: private,
		PublicKey:  public,
	}
}

// Helper function generates new private, public key pair
func newKeyPair() (ecdsa.PrivateKey, []byte) {
	curve := elliptic.P256()
	private, err := ecdsa.GenerateKey(curve, rand.Reader)
	utils.Check(err)
	pubKey := append(private.PublicKey.X.Bytes(), private.PublicKey.Y.Bytes()...)

	return *private, pubKey
}
```

Now, let’s generate an address:

```go
// pkg/wallet/wallet.go

// GetAddress returns wallet address
func (w *Wallet) GetAddress() []byte {
	pubKeyHash := utils.HashPubKey(w.PublicKey)

	versionedPayload := append([]byte{internal.Version}, pubKeyHash...)
	checksum := checksum(versionedPayload)

	fullPayload := append(versionedPayload, checksum...)
	address := []byte(base58.Encode(fullPayload))

	return address
}

// Helper function calculates checksum
func checksum(payload []byte) []byte {
	firstSHA := sha256.Sum256(payload)
	secondSHA := sha256.Sum256(firstSHA[:])

	return secondSHA[:internal.AddressChecksumLen]
}
```

```go
// pkg/utils/utils.go

// Helper function hashes public key
func HashPubKey(pubKey []byte) []byte {
	publicSHA256 := sha256.Sum256(pubKey)

	RIPEMD160Hasher := ripemd160.New()
	_, err := RIPEMD160Hasher.Write(publicSHA256[:])
	Check(err)
	publicRIPEMD160 := RIPEMD160Hasher.Sum(nil)

	return publicRIPEMD160
}
```

As a result, you’ll get a **real Bitcoin address**, you can even check its balance on [blockchain.info](https://blockchain.info/). But I can assure you that the balance is 0 no matter how many times you generate a new address and check its balance. This is why choosing proper public-key cryptography algorithm is so crucial: considering private keys are random numbers, the chance of generating the same number must be as low as possible. Ideally, it must be as low as “never”.

Also, pay attention that you don’t need to connect to a Bitcoin node to get an address. The address generation algorithm utilizes a combination of open algorithms that are implemented in many programming languages and libraries.

Now we need to modify inputs and outputs for them to use addresses:

```go
// pkg/transaction/transaction_input.go

type TXInput struct {
	Txid      []byte
	Vout      int
	Signature []byte
	PubKey    []byte
}

func (in *TXInput) UsesKey(pubKeyHash []byte) bool {
	lockingHash := utils.HashPubKey(in.PubKey)

	return bytes.Equal(lockingHash, pubKeyHash)
}
```

```go
// pkg/transaction/transaction_output.go

type TXOutput struct {
	Value      int
	PubKeyHash []byte
}

func (out *TXOutput) Lock(address []byte) {
	pubKeyHash := base58.Decode(string(address))
	pubKeyHash = pubKeyHash[1 : len(pubKeyHash)-addressChecksumLen]
	out.PubKeyHash = pubKeyHash
}

func (out *TXOutput) IsLockedWithKey(pubKeyHash []byte) bool {
	return bytes.Equal(out.PubKeyHash, pubKeyHash)
}
```

Notice, that we’re no longer using `ScriptPubKey` and `ScriptSig` fields, because we’re not going to implement a scripting language. Instead, `ScriptSig` is split into `Signature` and `PubKey` fields, and `ScriptPubKey` is renamed to `PubKeyHash`. We’ll implement the same outputs locking/unlocking and inputs signing logics as in Bitcoin, but we’ll do this in methods instead.

The `UsesKey` method checks that an input uses a specific key to unlock an output. Notice that inputs store raw public keys (i.e., not hashed), but the function takes a hashed one. `IsLockedWithKey` checks if provided public key hash was used to lock the output. This is a complementary function to `UsesKey`, and they’re both used in `FindUnspentTransactions` to build connections between transactions.

`Lock` simply locks an output. When we send coins to someone, we know only their address, thus the function takes an address as the only argument. The address is then decoded and the public key hash is extracted from it and saved in the `PubKeyHash` field.

We’ll also need the Wallets type to keep a collection of wallets, save them to a file, and load them from it:

```go
// pkg/wallet/wallets.go

type Wallets struct {
	Wallets map[string]*Wallet
}

func NewWallets() (*Wallets, error) {
	wallets := Wallets{}
	wallets.Wallets = make(map[string]*Wallet)

	err := wallets.LoadFromFile()

	return &wallets, err
}

// LoadFromFile loads wallets from the file
func (ws *Wallets) LoadFromFile() error {
	if _, err := os.Stat(internal.WalletFile); os.IsNotExist(err) {
		return err
	}

	fileContent, err := os.ReadFile(internal.WalletFile)
	if err != nil {
		return err
	}

	var wallets map[string][2][]byte
	decoder := gob.NewDecoder(bytes.NewReader(fileContent))
	err = decoder.Decode(&wallets)
	if err != nil {
		return err
	}

	ws.Decode(wallets)

	return nil
}

// SaveToFile saves wallets to a file
func (ws *Wallets) SaveToFile() {
	var content bytes.Buffer

	wallets := ws.Encode()
	encoder := gob.NewEncoder(&content)
	err := encoder.Encode(wallets)
	utils.Check(err)

	err = os.WriteFile(internal.WalletFile, content.Bytes(), 0644)
	utils.Check(err)
}
```

Now, let’s check that everything works correctly:

```shell
$ ./blockchain-go createwallet
Your new address: 178vmmuHgj54fzK1cgYvTdJkjWBtfFHFzw

$ ./blockchain-go createwallet
Your new address: 1C2mttxDStHt8x1ihSnP61pKEk7BwEH8sN

$ ./blockchain-go createwallet
Your new address: 1McmeAmzBcFjQvVjH6ZmMWSM8UuXKzTqck

$ ./blockchain-go listaddresses
1C2mttxDStHt8x1ihSnP61pKEk7BwEH8sN
178vmmuHgj54fzK1cgYvTdJkjWBtfFHFzw
1McmeAmzBcFjQvVjH6ZmMWSM8UuXKzTqck
```

Nice! Now let’s implement transaction signatures.

## Implementing Signatures

Transactions must be signed because this is the only way in Bitcoin to guarantee that one cannot spend coins belonging to someone else. If a signature is invalid, the transaction is considered invalid too and, thus, cannot be added to the blockchain.

We have all the pieces to implement transactions signing, except one thing: data to sign. What parts of a transaction are actually signed? Or a transaction is signed as a whole? Choosing data to sign is quite important. The thing is that data to be signed must contain information that identifies the data in a unique way. For example, it makes no sense signing just output values because such signature won’t consider the sender and the recipient.

Considering that transactions unlock previous outputs, redistribute their values, and lock new outputs, the following data must be signed:

1. Public key hashes stored in unlocked outputs. This identifies “sender” of a transaction.
2. Public key hashes stored in new, locked, outputs. This identifies “recipient” of a transaction.
3. Values of new outputs.

> In Bitcoin, locking/unlocking logic is stored in scripts, which are stored in `ScriptSig` and `ScriptPubKey` fields of inputs and outputs, respectively. Since Bitcoins allows different types of such scripts, it signs the whole content of `ScriptPubKey`.

As you can see, we don’t need to sign the public keys stored in inputs. Because of this, in Bitcoin, it’s not a transaction that’s signed, but its trimmed copy with inputs storing `ScriptPubKey` from referenced outputs.

A detailed process of getting a trimmed transaction copy is described [here](https://en.bitcoin.it/wiki/File:Bitcoin_OpCheckSig_InDetail.png). It’s likely to be outdated, but I didn’t manage to find a more reliable source of information.

Ok, it looks complicated, so let’s start coding. We’ll start with the Sign method:

```go
// pkg/transaction/transaction.go

func (tx *Transaction) Sign(privKey ecdsa.PrivateKey, prevTXs map[string]Transaction) {
	// Coinbase transactions are not signed because there are no real inputs in them.
	if tx.IsCoinbase() {
		return
	}

	// A trimmed copy will be signed, not a full transaction.
	txCopy := tx.TrimmedCopy()

	// Next, we iterate over each input in the copy.
	for inID, vin := range txCopy.Vin {
		// In each input, Signature is set to nil (just a double-check) and
		// PubKey is set to the PubKeyHash of the referenced output.
		prevTx := prevTXs[hex.EncodeToString(vin.Txid)]
		txCopy.Vin[inID].Signature = nil
		txCopy.Vin[inID].PubKey = prevTx.Vout[vin.Vout].PubKeyHash

		// The Hash method serializes the transaction and hashes it with the
		// SHA-256 algorithm. The resulted hash is the data we’re going to sign.
		txCopy.ID = txCopy.Hash()

		// After getting the hash we should reset the PubKey field, so it doesn’t
		// affect further iterations.
		txCopy.Vin[inID].PubKey = nil

		// We sign txCopy.ID with privKey. An ECDSA signature is a pair of numbers,
		// which we concatenate and store in the input’s Signature field.
		r, s, err := ecdsa.Sign(rand.Reader, &privKey, txCopy.ID)
		utils.Check(err)
		signature := append(r.Bytes(), s.Bytes()...)

		tx.Vin[inID].Signature = signature
	}
}
```

The method takes a private key and a map of previous transactions. As mentioned above, in order to sign a transaction, we need to access the outputs referenced in the inputs of the transaction, thus we need the transactions that store these outputs.

Now, the verification function:

```go
// pkg/transaction/transaction.go

func (tx *Transaction) Verify(prevTXs map[string]Transaction) bool {
	// First, we need the same transaction copy.
	txCopy := tx.TrimmedCopy()
	// Next, we’ll need the same curve that is used to generate key pairs.
	curve := elliptic.P256()

	// Next, we check signature in each input.
	for inID, vin := range tx.Vin {
		prevTx := prevTXs[hex.EncodeToString(vin.Txid)]
		txCopy.Vin[inID].Signature = nil
		txCopy.Vin[inID].PubKey = prevTx.Vout[vin.Vout].PubKeyHash
		txCopy.ID = txCopy.Hash()
		txCopy.Vin[inID].PubKey = nil

		// Here we unpack values stored in TXInput.Signature and TXInput.PubKey,
		// since a signature is a pair of numbers and a public key is a pair of
		// coordinates. We concatenated them earlier for storing, and now we need
		// to unpack them to use in crypto/ecdsa functions.
		r := big.Int{}
		s := big.Int{}
		sigLen := len(vin.Signature)
		r.SetBytes(vin.Signature[:(sigLen / 2)])
		s.SetBytes(vin.Signature[(sigLen / 2):])

		x := big.Int{}
		y := big.Int{}
		keyLen := len(vin.PubKey)
		x.SetBytes(vin.PubKey[:(keyLen / 2)])
		y.SetBytes(vin.PubKey[(keyLen / 2):])

		// Here it is: we create an ecdsa.PublicKey using the public key extracted
		// from the input and execute ecdsa.Verify passing the signature extracted
		// from the input. If all inputs are verified, return true; if at least
		// one input fails verification, return false.
		rawPubKey := ecdsa.PublicKey{Curve: curve, X: &x, Y: &y}
		if !ecdsa.Verify(&rawPubKey, txCopy.ID, &r, &s) {
			return false
		}
	}

	return true
}
```

Now, we need a function to obtain previous transactions. Since this requires interaction with the blockchain, we’ll make it a method of Blockchain:

```go
// pkg/blockchain/blockchain.go

func (bc *Blockchain) FindTransaction(ID []byte) (transaction.Transaction, error) {
	bci := bc.Iterator()

	for {
		block := bci.Next()

		for _, tx := range block.Transactions {
			if bytes.Equal(tx.ID, ID) {
				return *tx, nil
			}
		}

		if len(block.PrevBlockHash) == 0 {
			break
		}
	}

	return transaction.Transaction{}, errors.New("transaction not found")
}

func (bc *Blockchain) SignTransaction(
	tx *transaction.Transaction,
	privKey ecdsa.PrivateKey,
) {
	prevTXs := make(map[string]transaction.Transaction)

	for _, vin := range tx.Vin {
		prevTx, err := bc.FindTransaction(vin.Txid)
		utils.Check(err)
		prevTXs[hex.EncodeToString(prevTx.ID)] = prevTx
	}

	tx.Sign(privKey, prevTXs)
}

func (bc *Blockchain) VerifyTransaction(tx *transaction.Transaction) bool {
	prevTXs := make(map[string]transaction.Transaction)

	for _, vin := range tx.Vin {
		prevTX, err := bc.FindTransaction(vin.Txid)
		utils.Check(err)
		prevTXs[hex.EncodeToString(prevTX.ID)] = prevTX
	}

	return tx.Verify(prevTXs)
}
```

These functions are simple: `FindTransaction` finds a transaction by ID (this requires iterating over all the blocks in the blockchain); `SignTransaction` takes a transaction, finds transactions it references, and signs it; `VerifyTransaction` does the same, but verifies the transaction instead.

Now, we need to actually sign and verify transactions. Signing happens in the `NewUTXOTransaction`:

```go
// pkg/transaction/transaction.go

func NewUTXOTransaction(from, to string, amount int, bc blockchain) *Transaction {
    ...

    tx := Transaction{
		ID:   nil,
		Vin:  inputs,
		Vout: outputs,
	}
	tx.Hash()
	bc.SignTransaction(&tx, w.PrivateKey)

    return &tx
}
```

Verification happens before a transaction is put into a block:

```go
// pkg/blockchain/blockchain.go

func (bc *Blockchain) MineBlock(transactions []*transaction.Transaction) {
	var lastHash []byte

	for _, tx := range transactions {
		if !bc.VerifyTransaction(tx) {
			log.Panic("ERROR: Invalid transaction")
		}
	}

    ...
}
```

## Conclusion

It’s really awesome that we’ve got so far and implemented so many key features of Bitcoin! We’ve implemented almost everything outside networking, and in the next part, we’ll finish transactions.

**References:**

[Full source code](https://edwinho.online/blog/blockchain-in-go/part-5)

[Blockchain in Go](https://jeiwan.net/posts/building-blockchain-in-go-part-5/)

[Public-key Cryptography](https://en.wikipedia.org/wiki/Public-key_cryptography)

[Digital signature](https://en.wikipedia.org/wiki/Digital_signature)

[Elliptic curve](https://en.wikipedia.org/wiki/Elliptic_curve)

[Elliptic curve cryptography](https://en.wikipedia.org/wiki/Elliptic_curve_cryptography)

[ECDSA](https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm)

[Bitcoin address](https://en.bitcoin.it/wiki/Technical_background_of_version_1_Bitcoin_addresses)

[Address](https://en.bitcoin.it/wiki/Address)

[Base58](https://en.bitcoin.it/wiki/Base58Check_encoding)

[A gentle introduction to elliptic curve cryptography](http://andrea.corbellini.name/2015/05/17/elliptic-curve-cryptography-a-gentle-introduction/)
