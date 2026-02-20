const MagenRouter = artifacts.require("MagenRouter");
const PoolFactory = artifacts.require("PoolFactory");
const MockUSDC = artifacts.require("MockUSDC");

module.exports = async function (callback) {
    try {
        const accounts = await web3.eth.getAccounts();
        const me = accounts[0];

        // 1. Get Factory and MockUSDC
        const factory = await PoolFactory.deployed();
        const usdc = await MockUSDC.deployed();

        console.log("Factory:", factory.address);
        console.log("USDC:", usdc.address);

        // 2. Create Pool
        console.log("Creating Pool...");
        await factory.createPool("Test Sepolia", "CT", "UT", { from: me });

        const count = await factory.getPoolsLength();
        console.log("Pools length:", count.toString());

        const pool = await factory.getPool(count - 1);
        console.log("Created Pool:", pool.name, pool.router);

        const router = await MagenRouter.at(pool.router);

        // 3. Initialize Pool
        const initAmt = web3.utils.toWei("10", "ether");

        // Mint some USDC if needed
        const bal = await usdc.balanceOf(me);
        if (web3.utils.toBN(bal).lt(web3.utils.toBN(initAmt).mul(web3.utils.toBN(2)))) {
            console.log("Minting some USDC...");
            await usdc.mint(me, web3.utils.toWei("1000", "ether"), { from: me });
        }

        console.log("Approving for initialize...");
        await usdc.approve(router.address, initAmt, { from: me });

        console.log("Initializing...");
        await router.initialize(initAmt, "50", { from: me });
        console.log("Pool initialized with 10 USDC and 50% risk");

        // 4. Buy CT (SI)
        const buyAmt = web3.utils.toWei("1", "ether");
        console.log("Approving for buySI...");
        await usdc.approve(router.address, buyAmt, { from: me });

        console.log("Calling buySI...");
        try {
            // estimate gas to catch revert reason early
            const est = await router.buySI.estimateGas(buyAmt, { from: me });
            console.log("Estimated Gas:", est);

            const receipt = await router.buySI(buyAmt, { from: me, gas: est });
            console.log("buySI success!", receipt.tx);
        } catch (e) {
            console.error("buySI reverted!");
            console.error(e.message);
        }

        // 5. Check Output
        callback();
    } catch (e) {
        console.error("Test failed with error:");
        console.error(e);
        callback(e);
    }
}
