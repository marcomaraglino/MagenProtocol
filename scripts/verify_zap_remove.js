const MagenRouter = artifacts.require("MagenRouter");
const MockUSDC = artifacts.require("MockUSDC");
const PoolFactory = artifacts.require("PoolFactory");
const IUniswapV2Pair = artifacts.require("IUniswapV2Pair");

module.exports = async function (callback) {
    try {
        console.log("Starting Zap Out Verification...");
        const accounts = await web3.eth.getAccounts();
        const user = accounts[0];

        // 1. Setup Environment (Reuse existing deployment if possible, or deploy new)
        // For simplicity, we assume contracts are deployed or we reuse previous script logic.
        // Let's assume we are running on local dev where migrations ran.

        const factory = await PoolFactory.deployed();
        const usdc = await MockUSDC.deployed();

        // 2. Create Pool (if not exists)
        // We'll create a fresh one to be sure
        const poolName = "ZapTest_" + Math.floor(Math.random() * 1000);
        console.log("Creating Pool:", poolName);
        await factory.createPool(poolName, "zSI", "zNO");
        const poolCount = await factory.getPoolsLength();
        const pool = await factory.getPool(poolCount - 1);

        const router = await MagenRouter.at(pool.router);
        const pair = await IUniswapV2Pair.at(pool.pair);

        // 3. Add Liquidity (Zap In)
        const liqAmount = web3.utils.toWei("100", "ether");
        await usdc.approve(router.address, liqAmount, { from: user });
        await router.addLiquidityZap(liqAmount, { from: user });

        const lpBal = await pair.balanceOf(user);
        console.log("LP Balance after Zap In:", web3.utils.fromWei(lpBal));

        if (Number(web3.utils.fromWei(lpBal)) === 0) throw new Error("Zap In Failed");

        // 4. Remove Liquidity (Zap Out) -> USDC
        console.log("Zapping Out (LP -> USDC)...");
        await pair.approve(router.address, lpBal, { from: user });

        const usdcBefore = await usdc.balanceOf(user);
        await router.removeLiquidityZap(lpBal, { from: user });
        const usdcAfter = await usdc.balanceOf(user);

        const returned = web3.utils.toBN(usdcAfter).sub(web3.utils.toBN(usdcBefore));
        console.log("USDC Returned:", web3.utils.fromWei(returned));

        // Check LP is 0
        const lpBalFinal = await pair.balanceOf(user);
        console.log("Final LP Balance:", web3.utils.fromWei(lpBalFinal));

        if (Number(web3.utils.fromWei(lpBalFinal)) > 0) throw new Error("LP not fully burned");
        if (Number(web3.utils.fromWei(returned)) < 99) throw new Error("Returned USDC too low"); // Fees/Slippage might take a bit

        console.log("Zap Out Verification Successful!");

    } catch (e) {
        console.error("Verification Failed:", e);
        callback(e);
    }
    callback();
};
