
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockTo } from "./utilities"

describe("MasterChef", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.dev = this.signers[3]
    this.minter = this.signers[4]

    this.MasterChef = await ethers.getContractFactory("MasterChef")
    this.SushiToken = await ethers.getContractFactory("SushiToken")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
  })

  beforeEach(async function () {
    this.sushi = await this.SushiToken.deploy()
    await this.sushi.deployed()
  })

  it("should set correct state variables", async function () {
    this.chef = await this.MasterChef.deploy(this.sushi.address, this.dev.address, "1000", "0", "1000")
    await this.chef.deployed()

    await this.sushi.transferOwnership(this.chef.address)

    const sushi = await this.chef.sushi()
    const devaddr = await this.chef.devaddr()
    const owner = await this.sushi.owner()

    expect(sushi).to.equal(this.sushi.address)
    expect(devaddr).to.equal(this.dev.address)
    expect(owner).to.equal(this.chef.address)
  })

  it("should allow dev and only dev to update dev", async function () {
    this.chef = await this.MasterChef.deploy(this.sushi.address, this.dev.address, "1000", "0", "1000")
    await this.chef.deployed()

    expect(await this.chef.devaddr()).to.equal(this.dev.address)

    await expect(this.chef.connect(this.bob).dev(this.bob.address, { from: this.bob.address })).to.be.revertedWith("dev: wut?")

    await this.chef.connect(this.dev).dev(this.bob.address, { from: this.dev.address })

    expect(await this.chef.devaddr()).to.equal(this.bob.address)

    await this.chef.connect(this.bob).dev(this.alice.address, { from: this.bob.address })

    expect(await this.chef.devaddr()).to.equal(this.alice.address)
  })

  context("With ERC/LP token added to the field", function () {
    beforeEach(async function () {
      this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000")

      await this.lp.transfer(this.alice.address, "1000")

      await this.lp.transfer(this.bob.address, "1000")

      await this.lp.transfer(this.carol.address, "1000")

      this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000")

      await this.lp2.transfer(this.alice.address, "1000")

      await this.lp2.transfer(this.bob.address, "1000")

      await this.lp2.transfer(this.carol.address, "1000")
    })

    it("should allow emergency withdraw", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.sushi.address, this.dev.address, "100", "100", "1000")
      await this.chef.deployed()

      await this.chef.add("100", this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.chef.address, "1000")

      await this.chef.connect(this.bob).deposit(0, "100")

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("900")

      await this.chef.connect(this.bob).emergencyWithdraw(0)

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
    })

    it("should give out SUSHIs only after farming time", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.sushi.address, this.dev.address, "100", "100", "1000")
      await this.chef.deployed()

      await this.sushi.transferOwnership(this.chef.address)

      await this.chef.add("100", this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      await this.chef.connect(this.bob).deposit(0, "100")
      await advanceBlockTo("89")

      await this.chef.connect(this.bob).deposit(0, "0") // block 90
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("94")

      await this.chef.connect(this.bob).deposit(0, "0") // block 95
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("99")

      await this.chef.connect(this.bob).deposit(0, "0") // block 100
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("100")

      await this.chef.connect(this.bob).deposit(0, "0") // block 101
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("100")

      await advanceBlockTo("104")
      await this.chef.connect(this.bob).deposit(0, "0") // block 105

      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("500")
      expect(await this.sushi.balanceOf(this.dev.address)).to.equal("50")
      expect(await this.sushi.totalSupply()).to.equal("550")
    })

    it("should not distribute SUSHIs if no one deposit", async function () {
      // 100 per block farming rate starting at block 200 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.sushi.address, this.dev.address, "100", "200", "1000")
      await this.chef.deployed()
      await this.sushi.transferOwnership(this.chef.address)
      await this.chef.add("100", this.lp.address, true)
      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      await advanceBlockTo("199")
      expect(await this.sushi.totalSupply()).to.equal("0")
      await advanceBlockTo("204")
      expect(await this.sushi.totalSupply()).to.equal("0")
      await advanceBlockTo("209")
      await this.chef.connect(this.bob).deposit(0, "10") // block 210
      expect(await this.sushi.totalSupply()).to.equal("0")
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.sushi.balanceOf(this.dev.address)).to.equal("0")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("990")
      await advanceBlockTo("219")
      await this.chef.connect(this.bob).withdraw(0, "10") // block 220
      expect(await this.sushi.totalSupply()).to.equal("1100")
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.sushi.balanceOf(this.dev.address)).to.equal("100")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
    })

    it("should distribute SUSHIs properly for each staker", async function () {
      // 100 per block farming rate starting at block 300 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.sushi.address, this.dev.address, "100", "300", "1000")
      await this.chef.deployed()
      await this.sushi.transferOwnership(this.chef.address)
      await this.chef.add("100", this.lp.address, true)
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", {
        from: this.alice.address,
      })
      await this.lp.connect(this.bob).approve(this.chef.address, "1000", {
        from: this.bob.address,
      })
      await this.lp.connect(this.carol).approve(this.chef.address, "1000", {
        from: this.carol.address,
      })
      // Alice deposits 10 LPs at block 310
      await advanceBlockTo("309")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // Bob deposits 20 LPs at block 314
      await advanceBlockTo("313")
      await this.chef.connect(this.bob).deposit(0, "20", { from: this.bob.address })
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo("317")
      await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address })
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*100 + 4*1/3*100 + 2*1/6*100 = 566
      //   MasterChef should have the remaining: 1000 - 566 = 434
      await advanceBlockTo("319")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      expect(await this.sushi.totalSupply()).to.equal("1100")
      expect(await this.sushi.balanceOf(this.alice.address)).to.equal("566")
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.sushi.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.sushi.balanceOf(this.chef.address)).to.equal("434")
      expect(await this.sushi.balanceOf(this.dev.address)).to.equal("100")
      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*100 + 2*2/6*100 + 10*2/7*100 = 619
      await advanceBlockTo("329")
      await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address })
      expect(await this.sushi.totalSupply()).to.equal("2200")
      expect(await this.sushi.balanceOf(this.alice.address)).to.equal("566")
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("619")
      expect(await this.sushi.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.sushi.balanceOf(this.chef.address)).to.equal("815")
      expect(await this.sushi.balanceOf(this.dev.address)).to.equal("200")
      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo("339")
      await this.chef.connect(this.alice).withdraw(0, "20", { from: this.alice.address })
      await advanceBlockTo("349")
      await this.chef.connect(this.bob).withdraw(0, "15", { from: this.bob.address })
      await advanceBlockTo("359")
      await this.chef.connect(this.carol).withdraw(0, "30", { from: this.carol.address })
      expect(await this.sushi.totalSupply()).to.equal("5500")
      expect(await this.sushi.balanceOf(this.dev.address)).to.equal("500")
      // Alice should have: 566 + 10*2/7*100 + 10*2/6.5*100 = 1159
      expect(await this.sushi.balanceOf(this.alice.address)).to.equal("1159")
      // Bob should have: 619 + 10*1.5/6.5 * 100 + 10*1.5/4.5*100 = 1183
      expect(await this.sushi.balanceOf(this.bob.address)).to.equal("1183")
      // Carol should have: 2*3/6*100 + 10*3/7*100 + 10*3/6.5*100 + 10*3/4.5*1000 + 10*1000 = 2657
      expect(await this.sushi.balanceOf(this.carol.address)).to.equal("2657")
      // All of them should have 1000 LPs back.
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000")
    })

    it("should give proper SUSHIs allocation to each pool", async function () {
      // 100 per block farming rate starting at block 400 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.sushi.address, this.dev.address, "100", "400", "1000")
      await this.sushi.transferOwnership(this.chef.address)
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address })
      await this.lp2.connect(this.bob).approve(this.chef.address, "1000", { from: this.bob.address })
      // Add first LP to the pool with allocation 1
      await this.chef.add("10", this.lp.address, true)
      // Alice deposits 10 LPs at block 410
      await advanceBlockTo("409")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // Add LP2 to the pool with allocation 2 at block 420
      await advanceBlockTo("419")
      await this.chef.add("20", this.lp2.address, true)
      // Alice should have 1*1000 pending reward
      expect(await this.chef.pendingSushi(0, this.alice.address)).to.equal("1000")
      // Bob deposits 10 LP2s at block 425
      await advanceBlockTo("424")
      await this.chef.connect(this.bob).deposit(1, "5", { from: this.bob.address })
      // Alice should have 1000 + 5*1/3*10 = 1166 pending reward
      expect(await this.chef.pendingSushi(0, this.alice.address)).to.equal("1166")
      await advanceBlockTo("430")
      // At block 430. Bob should get 5*2/3*100 = 333. Alice should get ~166 more.
      expect(await this.chef.pendingSushi(0, this.alice.address)).to.equal("1333")
      expect(await this.chef.pendingSushi(1, this.bob.address)).to.equal("333")
    })

    it("should stop giving bonus SUSHIs after the bonus period ends", async function () {
      // 100 per block farming rate starting at block 500 with bonus until block 600
      this.chef = await this.MasterChef.deploy(this.sushi.address, this.dev.address, "100", "500", "600")
      await this.sushi.transferOwnership(this.chef.address)
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address })
      await this.chef.add("1", this.lp.address, true)
      // Alice deposits 10 LPs at block 590
      await advanceBlockTo("589")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // At block 605, she should have 1000*1 + 100*5 = 10500 pending.
      await advanceBlockTo("605")
      expect(await this.chef.pendingSushi(0, this.alice.address)).to.equal("1500")
      // At block 606, Alice withdraws all pending rewards and should get 1600.
      await this.chef.connect(this.alice).deposit(0, "0", { from: this.alice.address })
      expect(await this.chef.pendingSushi(0, this.alice.address)).to.equal("0")
      expect(await this.sushi.balanceOf(this.alice.address)).to.equal("1600")
    })
  })
})
