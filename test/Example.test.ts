import * as assert from 'assert'
import * as addresses from './addresses'
import bre from '@nomiclabs/buidler'
import { Signer, BigNumber, Contract } from 'ethers'

const OVERRIDES = {
  gasLimit: 9.5e6,
  gasPrice: 60e9
}

let signer: Signer
let exampleContract: Contract

function getTokenContract(tokenSymbol: string, signer: Signer): Promise<Contract> {
  const tokenAddress = addresses.getTokenAddress(tokenSymbol)

  const tokenContract = bre.ethers.getContractAt(
    'IERC20',
    tokenAddress,
    signer
  )

  return tokenContract
}

async function getBalance(tokenSymbol: string, address: string): Promise<BigNumber> {
  if (tokenSymbol == 'ETH') {
    return await bre.ethers.provider.getBalance(address)
  } else {
    const token = await getTokenContract(tokenSymbol, signer)

    return await token.balanceOf(address)
  }
}

async function transfer(tokenSymbol: string, amount: BigNumber): Promise<void> {
  if (tokenSymbol == 'ETH') {
    signer.sendTransaction({
      to: exampleContract.address,
      value: amount
    })
  } else {
    const token = await getTokenContract(tokenSymbol, signer)

    await token.transfer(
      exampleContract.address,
      amount,
      OVERRIDES
    )
  }
}

async function ensureMinBalance(tokenSymbol: string, minBalance: BigNumber): Promise<void> {
  console.log(`\nEnsuring that contract can cover fees...`)

  let contractTokenPayBalance = await getBalance(tokenSymbol, exampleContract.address)
  console.log(`  contract ${tokenSymbol} balance`, contractTokenPayBalance.toString())

  if (contractTokenPayBalance.lt(minBalance)) {
    console.log(`  contract will not be able to cover fee, sending from signer...`)

    const signerAddress = await signer.getAddress()
    const signerTokenPayBalance = await getBalance(tokenSymbol, signerAddress)
    console.log(`  signer ${tokenSymbol} balance`, signerTokenPayBalance.toString())

    if (signerTokenPayBalance.lt(minBalance)) {
      throw new Error(`Signer does not have ${minBalance.toString()} ${tokenSymbol}`)
    }

    await transfer(tokenSymbol, minBalance)

    contractTokenPayBalance = await getBalance(tokenSymbol, exampleContract.address)
    console.log(`  new contract ${tokenSymbol} balance`, contractTokenPayBalance.toString())
  }
}

async function getDecimals(tokenSymbol: string): Promise<number> {
  if (tokenSymbol == 'ETH') {
    return 18
  } else {
    const token = await getTokenContract(tokenSymbol, signer)

    return await token.decimals()
  }
}

function itSuccesfullyFlashSwaps(
  tokenBorrowSymbol: string,
  tokenPaySymbol: string,
  borrowAmount: string,
  feeCushionAmount: string
): void {
  it('successfully flash swaps', async () => {
    console.log(`\nTesting swap - borrows ${borrowAmount} ${tokenBorrowSymbol}, paying with ${tokenPaySymbol}`)

    const amountToBorrow = bre.ethers.utils.parseUnits(borrowAmount, await getDecimals(tokenBorrowSymbol))
    const minBalance = bre.ethers.utils.parseUnits(feeCushionAmount, await getDecimals(tokenPaySymbol))
    await ensureMinBalance(tokenPaySymbol, minBalance)

    console.log(`\nPerforming flash swap...`)
    const bytes = bre.ethers.utils.arrayify('0x00')
    await exampleContract.flashSwap(
      addresses.getTokenAddress(tokenBorrowSymbol),
      amountToBorrow,
      addresses.getTokenAddress(tokenPaySymbol),
      bytes
    )

    assert.ok(true)
  })
}

describe('Example', () => {
  before('set up signer', () => {
    console.log('\nSetting up signer...')
    signer = bre.ethers.provider.getSigner(
      addresses.getSignerAddress()
    )
  })

  before('deploy example contract', async () => {
    console.log('\nDeploying example contract...')
    const factory = await bre.ethers.getContractFactory('ExampleContract', signer)
    exampleContract = await factory.deploy(OVERRIDES)
  })

  itSuccesfullyFlashSwaps('USDC', 'USDC', '100', '5')
  // itSuccesfullyFlashSwaps('TUSD', 'TUSD', '100', '5')
  // itSuccesfullyFlashSwaps('DAI', 'DAI', '1000', '25')
  // itSuccesfullyFlashSwaps('KNC', 'KNC', '1000', '25')
  // itSuccesfullyFlashSwaps('KNC', 'DAI', '100', '25')
  // itSuccesfullyFlashSwaps('ETH', 'ETH', '1', '1')
  // itSuccesfullyFlashSwaps('ETH', 'DAI', '10', '100')
  // itSuccesfullyFlashSwaps('WETH', 'WETH', '10', '1')
})
