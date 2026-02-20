const MagenRouter = artifacts.require("MagenRouter");
const PoolFactory = artifacts.require("PoolFactory");
const MockUSDC = artifacts.require("MockUSDC");
const MockUniswapV2Factory = artifacts.require("MockUniswapV2Factory");
const MockUniswapV2Router02 = artifacts.require("MockUniswapV2Router02");

module.exports = async function (callback) {
    try {
        const accounts = await web3.eth.getAccounts();
        const me = accounts[0];

        // 1. Deploy Factory, Mocks
        const usdc = await MockUSDC.new();
        const factory = await MockUniswapV2Factory.new();
        const routerMock = await MockUniswapV2Router02.new(factory.address);
        const poolFactory = await PoolFactory.new(usdc.address, factory.address, routerMock.address);

        console.log("Deployed all base contracts");

        // 2. Create Pool
        await poolFactory.createPool("Test", "CT", "UT");
        const count = await poolFactory.getPoolsLength();
        console.log("Pools length:", count.toString());

        const pool = await poolFactory.getPool(0);
        console.log("Created Pool:", pool.name, pool.router);

        const router = await MagenRouter.at(pool.router);

        // 3. Initialize Pool
        const initAmt = web3.utils.toWei("100", "ether");
        await usdc.approve(router.address, initAmt, { from: me });
        await router.initialize(initAmt, "80", { from: me });
        console.log("Pool initialized with 100 USDC and 80% risk");

        // 4. Buy CT (SI)
        const buyAmt = web3.utils.toWei("10", "ether");
        await usdc.approve(router.address, buyAmt, { from: me });

        console.log("Calling buySI...");
        const receipt = await router.buySI(buyAmt, { from: me });
        console.log("buySI success!", receipt.tx);

        // 5. Check Output
        callback();
    } catch (e) {
        console.error("Test failed with error:");
        console.error(e);
        callback(e);
    }
}
