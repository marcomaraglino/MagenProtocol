const statusDiv = document.getElementById('status');
let web3;
let accounts;
let poolFactory;
let mockUSDC, magenRouter, magenVault, outcomeSI, outcomeNO, uniswapPair;
let contracts = {};

// Chart Instance
let priceChart;

// Current Mode: 'coverage' | 'underwrite' | 'liquidity'
let currentMode = 'coverage';
let currentLiqMode = 'mint'; // 'mint' | 'add' | 'remove'
let currentTradeAction = 'buy'; // 'buy' | 'sell'

// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function updateStatus(msg, type = 'success') {
    if (statusDiv) statusDiv.innerText = msg;
    showToast(msg, type);
}


function showView(viewId) {
    document.getElementById('viewMarkets').style.display = 'none';
    document.getElementById('viewCreate').style.display = 'none';
    document.getElementById('viewDashboard').style.display = 'none';
    document.getElementById('viewManage').style.display = 'none';

    document.getElementById(viewId).style.display = 'block';

    if (viewId === 'viewMarkets') {
        loadMarkets();
    }
}

// ==========================================
// Initialization
// ==========================================

async function loadArtifact(name, address = null) {
    try {
        const response = await fetch(`../build/contracts/${name}.json?v=${Date.now()}`);
        if (!response.ok) throw new Error(`Failed to load ${name}`);
        const data = await response.json();

        if (address) {
            return new web3.eth.Contract(data.abi, address);
        }

        const netId = await web3.eth.net.getId();
        let deployedNetwork = data.networks[netId];

        if (!deployedNetwork) {
            updateStatus(`Contract not found on network ID: ${netId}.`, 'error');
            return null;
        }
        return new web3.eth.Contract(data.abi, deployedNetwork.address);
    } catch (e) {
        console.warn(`Could not load artifact: ${name}`, e);
        return null;
    }
}

async function init() {
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        try {
            accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

            // Connect Button Update
            const btn = document.getElementById('connectWalletBtn');
            if (btn) {
                btn.innerText = accounts[0].substring(0, 6) + '...' + accounts[0].substring(38);
                btn.classList.add('connected');
            }

            updateStatus("Connected", "success");

            // Load USDC & Factory
            mockUSDC = await loadArtifact("MockUSDC");
            poolFactory = await loadArtifact("PoolFactory");

            if (!poolFactory) {
                updateStatus("Factory not found. Check network.", "error");
                return;
            }

            // Initial view
            showView('viewMarkets');

            // Listeners
            window.ethereum.on('accountsChanged', function (newAccounts) {
                accounts = newAccounts;
                window.location.reload();
            });

            // Slider Listeners
            const riskSlider = document.getElementById('newPoolRisk');
            const riskDisplay = document.getElementById('newPoolRiskDisplay');
            if (riskSlider && riskDisplay) {
                riskSlider.addEventListener('input', (e) => {
                    riskDisplay.innerText = `${e.target.value}%`;
                });
            }

            const initRiskSlider = document.getElementById('initRisk');
            const initRiskDisplay = document.getElementById('initRiskDisplay');
            if (initRiskSlider && initRiskDisplay) {
                initRiskSlider.addEventListener('input', (e) => {
                    initRiskDisplay.innerText = `${e.target.value}%`;
                });
            }

        } catch (error) {
            console.error(error);
            updateStatus("Connection Failed", "error");
        }
    } else {
        updateStatus("Please install MetaMask!", "error");
    }
}

// ==========================================
// Factory & Pools
// ==========================================

async function loadMarkets() {
    if (!poolFactory) return;
    const list = document.getElementById('marketsList');
    list.innerHTML = 'Loading...';

    // Also populate Admin Markets
    const adminList = document.getElementById('adminMarketsList');
    if (adminList) adminList.innerHTML = 'Loading...';

    try {
        const count = await poolFactory.methods.getPoolsLength().call();
        list.innerHTML = '';
        if (adminList) adminList.innerHTML = '';

        if (count == 0) {
            list.innerHTML = '<div class="glass-card" style="text-align:center; padding: 40px;">Connect to see available Insurance Pools</div>';
            if (adminList) adminList.innerHTML = '<div class="glass-card" style="text-align:center; padding: 40px;">No pools available to manage</div>';
            return;
        }

        for (let i = 0; i < count; i++) {
            const pool = await poolFactory.methods.getPool(i).call();
            // pool is struct { name, router, vault, ... }

            const card = document.createElement('div');
            card.className = 'glass-card';
            card.style.display = 'flex';
            card.style.justifyContent = 'space-between';
            card.style.alignItems = 'center';
            card.style.marginBottom = '20px';

            card.innerHTML = `
                <div>
                    <h3 style="margin: 0 0 5px 0;">${pool.name}</h3>
                    <p style="color: var(--text-muted); font-size: 0.9em; margin: 0;">Status: Active</p>
                </div>
                <button class="action-btn btn-primary" style="width: auto; padding: 8px 16px;" 
                    onclick="openPool('${pool.router}', '${pool.vault}', '${pool.pair}', '${pool.name}')">
                    View Pool
                </button>
            `;
            list.appendChild(card);

            if (adminList) {
                const adminCard = document.createElement('div');
                adminCard.className = 'glass-card';
                adminCard.style.display = 'flex';
                adminCard.style.justifyContent = 'space-between';
                adminCard.style.alignItems = 'center';
                adminCard.style.marginBottom = '20px';

                adminCard.innerHTML = `
                    <div>
                        <h3 style="margin: 0 0 5px 0;">${pool.name}</h3>
                        <p style="color: var(--text-muted); font-size: 0.9em; margin: 0;">Status: Active</p>
                    </div>
                    <button class="action-btn btn-secondary" style="width: auto; padding: 8px 16px; border-color: var(--danger); color: var(--danger)" 
                        onclick="openAdminModal('${pool.router}', '${pool.vault}', '${pool.name}')">
                        Admin Zone
                    </button>
                `;
                adminList.appendChild(adminCard);
            }
        }
    } catch (e) {
        console.error("Error loading markets:", e);
        list.innerHTML = `<div class="glass-card" style="color: var(--danger); text-align: center;">
            Error loading markets: <br> ${e.message}
        </div>`;
        if (adminList) {
            adminList.innerHTML = list.innerHTML;
        }
    }
}

async function createPool() {
    const name = document.getElementById('newPoolName').value;
    const symSI = "CT";
    const symNO = "UT";
    const risk = document.getElementById('newPoolRisk').value;
    const liquidity = document.getElementById('newPoolLiquidity').value;

    if (!name || !risk || !liquidity) {
        updateStatus("Please fill all fields", "error");
        return;
    }

    try {
        const weiLiquidity = web3.utils.toWei(liquidity, 'ether');
        const riskBN = web3.utils.toBN(risk);

        // 1. Create Pool
        updateStatus("1/3 Deploying Pool Contracts... (Please Confirm)");
        const receipt = await poolFactory.methods.createPool(name, symSI, symNO).send({ from: accounts[0] });

        let event = receipt.events.PoolCreated;
        if (Array.isArray(event)) event = event[event.length - 1];

        const routerAddr = event.returnValues.router;

        updateStatus(`Pool Deployed at ${routerAddr.substring(0, 6)}...`);

        // 2. Approve USDC
        updateStatus("2/3 Approving USDC... (Please Confirm)");
        await mockUSDC.methods.approve(routerAddr, weiLiquidity).send({ from: accounts[0] });

        // 3. Initialize
        updateStatus("3/3 Initializing Pool... (Please Confirm)");
        const newRouter = await loadArtifact("MagenRouter", routerAddr);
        await newRouter.methods.initialize(weiLiquidity, riskBN).send({ from: accounts[0] });

        updateStatus("Pool Created and Initialized Successfully!");

        document.getElementById('newPoolName').value = '';
        document.getElementById('newPoolLiquidity').value = '';

        showView('viewMarkets');
    } catch (e) {
        console.error("Create Pool Failed:", e);
        updateStatus("Failed: " + (e.message || e), "error");
    }
}

async function openPool(routerAddr, vaultAddr, pairAddr, name) {
    document.getElementById('poolTitle').innerText = name;

    // Load Contracts for specific pool
    // Load Contracts for specific pool
    magenRouter = await loadArtifact("MagenRouter", routerAddr);
    magenVault = await loadArtifact("MagenVault", vaultAddr);
    uniswapPair = await loadArtifact("IUniswapV2Pair", pairAddr);

    // Load Tokens
    if (magenVault) {
        try {
            const siAddr = await magenVault.methods.tokenSI().call();
            const noAddr = await magenVault.methods.tokenNO().call();
            const siArt = await fetch(`../build/contracts/OutcomeToken.json`).then(r => r.json());
            outcomeSI = new web3.eth.Contract(siArt.abi, siAddr);
            outcomeNO = new web3.eth.Contract(siArt.abi, noAddr);
        } catch (e) { console.error("Error loading tokens", e); }
    }

    showView('viewDashboard');
    initChart();
    updateStats();
    // Default to coverage
    switchTab('coverage');
}

// ==========================================
// UI Logic: Tabs & Chart
// ==========================================

function switchTab(mode) {
    currentMode = mode;
    hideTradeForm();

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick="switchTab('${mode}')"]`).classList.add('active');

    if (mode === 'liquidity') {
        document.getElementById('tradeUI').style.display = 'none';
        document.getElementById('liquidityUI').style.display = 'block';
        setLiqMode('add');
    } else {
        document.getElementById('tradeUI').style.display = 'block';
        document.getElementById('liquidityUI').style.display = 'none';

        if (mode === 'coverage') {
            document.querySelector('#tradeDesc').innerText = "Trade Coverage Tokens (CT) to manage your exposure.";
            document.getElementById('currentPremium').nextElementSibling.innerText = "Premium Price";
        } else {
            document.querySelector('#tradeDesc').innerText = "Buy Yield Tokens (UT) to earn yield from premiums.";
            document.getElementById('currentPremium').nextElementSibling.innerText = "Implied APY";
        }
    }
    updateStats();
}

function showTradeForm(action) {
    currentTradeAction = action;
    document.getElementById('tradeActionSelection').style.display = 'none';
    document.getElementById('tradeFormContainer').style.display = 'block';

    document.getElementById('inputAmount').value = '';
    document.getElementById('estTokens').innerText = '0';
    document.getElementById('tradeFormTitle').innerText = action === 'buy' ? 'Buy' : 'Sell';

    const tokenName = currentMode === 'coverage' ? 'CT' : 'UT';

    if (action === 'buy') {
        document.getElementById('tradeInputUnit').innerText = 'USDC';
    } else {
        document.getElementById('tradeInputUnit').innerText = tokenName;
    }
}

function hideTradeForm() {
    document.getElementById('tradeActionSelection').style.display = 'flex';
    document.getElementById('tradeFormContainer').style.display = 'none';
    document.getElementById('inputAmount').value = '';
}

async function setMaxTrade() {
    if (!accounts) return;
    const input = document.getElementById('inputAmount');

    if (currentTradeAction === 'buy') {
        const usdcBal = await mockUSDC.methods.balanceOf(accounts[0]).call();
        input.value = parseFloat(web3.utils.fromWei(usdcBal, 'ether')).toFixed(4);
    } else {
        const token = currentMode === 'coverage' ? outcomeSI : outcomeNO;
        const bal = await token.methods.balanceOf(accounts[0]).call();
        input.value = parseFloat(web3.utils.fromWei(bal, 'ether')).toFixed(4);
    }
    updateStats(); // to trigger estimation
}

// Bind input event to estimation update
document.getElementById('inputAmount').addEventListener('input', updateStats);

function setLiqMode(mode) {
    currentLiqMode = mode;
    // Update Buttons
    document.querySelectorAll('.link-btn').forEach(btn => btn.classList.remove('active'));
    if (mode === 'add') document.getElementById('btnLiqAdd').classList.add('active');
    if (mode === 'remove') document.getElementById('btnLiqRemove').classList.add('active');

    // Show Sections
    document.getElementById('liqAdd').style.display = 'none';
    document.getElementById('liqRemove').style.display = 'none';

    if (mode === 'add') document.getElementById('liqAdd').style.display = 'block';
    if (mode === 'remove') document.getElementById('liqRemove').style.display = 'block';

    // Add Zap Out Mode visibility if we add a 3rd tab, or just put button in remove?
    // User asked for "button where I can swap my lptoken (the liquidity token to my usdc)"
    // Let's add it to the 'remove' section as an alternative action.
}

function initChart() {
    if (priceChart) priceChart.destroy();
    const ctx = document.getElementById('priceChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.5)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

    const data = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
            label: 'Coverage Price (SI)',
            data: [0.05, 0.08, 0.04, 0.12, 0.09, 0.15], // Dummy Data
            borderColor: '#38bdf8',
            backgroundColor: gradient,
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
        }]
    };

    priceChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

// ==========================================
// Interaction Logic
// ==========================================

async function executeTrade() {
    if (!accounts) {
        updateStatus("Please Connect Wallet First", "error");
        return;
    }

    const amt = document.getElementById('inputAmount').value;
    if (!amt || parseFloat(amt) <= 0) {
        updateStatus("Please enter a valid amount", "error");
        return;
    }

    const weiAmt = web3.utils.toWei(amt, 'ether');
    updateStatus("Processing...");

    try {
        if (currentTradeAction === 'buy') {
            await mockUSDC.methods.approve(magenRouter.options.address, weiAmt).send({ from: accounts[0] });

            if (currentMode === 'coverage') {
                updateStatus("Buying Coverage (CT)...");
                await magenRouter.methods.buySI(weiAmt).send({ from: accounts[0] });
                updateStatus("Coverage Purchased!", "success");
            } else if (currentMode === 'underwrite') {
                updateStatus("Underwriting (Buying UT)...");
                await magenRouter.methods.buyNO(weiAmt).send({ from: accounts[0] });
                updateStatus("Underwritten Successfully!", "success");
            }
        } else {
            if (currentMode === 'coverage') {
                updateStatus("Approving CT...");
                await outcomeSI.methods.approve(magenRouter.options.address, weiAmt).send({ from: accounts[0] });
                updateStatus("Selling CT...");
                await magenRouter.methods.sellSI(weiAmt).send({ from: accounts[0] });
                updateStatus("Sold CT for USDC!", "success");
            } else if (currentMode === 'underwrite') {
                updateStatus("Approving UT...");
                await outcomeNO.methods.approve(magenRouter.options.address, weiAmt).send({ from: accounts[0] });
                updateStatus("Selling UT...");
                await magenRouter.methods.sellNO(weiAmt).send({ from: accounts[0] });
                updateStatus("Sold UT for USDC!", "success");
            }
        }

        hideTradeForm();
        updateStats();
    } catch (e) {
        console.error(e);
        updateStatus("Transaction Failed: " + (e.message || e), "error");
    }
}

// --- LIQUIDITY HANDLERS ---

async function handleLiqAddZap() {
    const amt = document.getElementById('addLiquidityUSDC').value;
    if (!amt) return;
    updateStatus("Adding Liquidity...");
    try {
        const wei = web3.utils.toWei(amt, 'ether');
        // 1. Approve USDC to Router
        updateStatus("Approving USDC...");
        await mockUSDC.methods.approve(magenRouter.options.address, wei).send({ from: accounts[0] });

        // 2. Add Liquidity (Smart)
        updateStatus("Adding Liquidity...");
        await magenRouter.methods.addLiquidity(wei).send({ from: accounts[0] });

        updateStatus("Liquidity Added!", "success");
        updateStats();
    } catch (e) { updateStatus("Add Liq Failed: " + e.message, "error"); }
}


async function handleLiqRemove() {
    const lp = document.getElementById('removeLP').value;
    if (!lp) return;

    updateStatus("Removing Liquidity...");
    try {
        const weiLP = web3.utils.toWei(lp, 'ether');

        // Check Balance
        const bal = await uniswapPair.methods.balanceOf(accounts[0]).call();
        if (web3.utils.toBN(bal).lt(web3.utils.toBN(weiLP))) {
            throw new Error("Insufficient LP Balance");
        }

        // Get Uniswap Router Address
        const routerAddr = await magenRouter.methods.uniswapRouter().call();
        const uniRouter = await loadArtifact("IUniswapV2Router02", routerAddr);

        // Approve Router to spend LP
        updateStatus("Approving LP...");
        await uniswapPair.methods.approve(routerAddr, weiLP).send({ from: accounts[0] });

        updateStatus("Removing Liquidity (Uniswap)...");

        // Remove Liquidity
        // min amounts 0 for MVP
        const deadline = Math.floor(Date.now() / 1000) + 300;
        await uniRouter.methods.removeLiquidity(
            outcomeSI.options.address,
            outcomeNO.options.address,
            weiLP,
            0,
            0,
            accounts[0],
            deadline
        ).send({ from: accounts[0] });

        updateStatus("Liquidity Removed!", "success");
        updateStats();
    } catch (e) { updateStatus("Remove LP Failed: " + e.message, "error"); }
}



async function setMaxLP() {
    if (!uniswapPair) return;
    const bal = await uniswapPair.methods.balanceOf(accounts[0]).call();
    const balFmt = web3.utils.fromWei(bal, 'ether');
    document.getElementById('removeLP').value = balFmt;
}

// ---------------------------

async function updateStats() {
    if (!uniswapPair || !web3) return;

    try {
        // Get Reserves from Uniswap Pair
        const reserves = await uniswapPair.methods.getReserves().call();
        const token0 = await uniswapPair.methods.token0().call();
        const tokenSIAddr = outcomeSI.options.address;

        // Identify which reserve is SI
        const isToken0SI = (token0.toLowerCase() === tokenSIAddr.toLowerCase());
        const rawResSI = isToken0SI ? reserves[0] : reserves[1];
        const rawResNO = isToken0SI ? reserves[1] : reserves[0];

        const rSI = parseFloat(web3.utils.fromWei(rawResSI, 'ether'));
        const rNO = parseFloat(web3.utils.fromWei(rawResNO, 'ether'));

        // TOTAL LIQUIDITY (USDC in Vault) - still valid metric for Magen Protocol
        const vaultUSDC = await mockUSDC.methods.balanceOf(magenVault.options.address).call();
        const tvlUSDC = parseFloat(web3.utils.fromWei(vaultUSDC, 'ether'));

        const elTVL = document.getElementById('statTVL');
        if (elTVL) elTVL.innerText = `$${tvlUSDC.toFixed(2)}`;

        // Balances
        if (accounts) {
            const lpBal = await uniswapPair.methods.balanceOf(accounts[0]).call();
            const lpBalFmt = parseFloat(web3.utils.fromWei(lpBal, 'ether')).toFixed(2);
            if (document.getElementById('displayLPBal')) document.getElementById('displayLPBal').innerText = lpBalFmt;

            const usdcBal = await mockUSDC.methods.balanceOf(accounts[0]).call();
            const usdcBalFmt = parseFloat(web3.utils.fromWei(usdcBal, 'ether')).toFixed(2);

            const siBal = await outcomeSI.methods.balanceOf(accounts[0]).call();
            const siBalFmt = parseFloat(web3.utils.fromWei(siBal, 'ether')).toFixed(2);

            const noBal = await outcomeNO.methods.balanceOf(accounts[0]).call();
            const noBalFmt = parseFloat(web3.utils.fromWei(noBal, 'ether')).toFixed(2);

            // Display Token Info
            const infoEl = document.getElementById('tokenInfoContent');
            if (infoEl) {
                const shortAddr = (addr) => addr ? `${addr.substring(0, 6)}...${addr.substring(38)}` : 'N/A';

                infoEl.innerHTML = `
                    <div style="margin-bottom: 8px;">
                        <strong>USDC:</strong> ${shortAddr(mockUSDC.options.address)} <br>
                        <span style="color: var(--primary);">Bal: ${usdcBalFmt}</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong>SI Token (Yes):</strong> ${shortAddr(outcomeSI.options.address)} <br>
                        <span style="color: var(--primary);">Bal: ${siBalFmt}</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                         <strong>NO Token (Yield):</strong> ${shortAddr(outcomeNO.options.address)} <br>
                         <span style="color: var(--primary);">Bal: ${noBalFmt}</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                         <strong>LP Token (Uni V2):</strong> ${shortAddr(uniswapPair.options.address)} <br>
                         <span style="color: var(--primary);">Bal: ${lpBalFmt}</span>
                    </div>
                `;
            }
        }

        // Trade Estimations (Coverage/Underwrite only)
        if (currentMode !== 'liquidity') {
            const inputVal = parseFloat(document.getElementById('inputAmount').value) || 0;
            const estEl = document.getElementById('estTokens');
            const premEl = document.getElementById('currentPremium');

            if (rSI > 0 && rNO > 0) {
                const probSI = rNO / (rSI + rNO);
                const probNO = rSI / (rSI + rNO);
                const impliedYield = ((1 - probNO) / probNO) * 100;

                if (currentMode === 'coverage') {
                    if (currentTradeAction === 'buy') {
                        const est = inputVal / probSI;
                        estEl.innerText = `${est.toFixed(2)}`;
                    } else {
                        const est = inputVal * probSI;
                        estEl.innerText = `${est.toFixed(2)}`;
                    }
                    premEl.innerText = `${(probSI * 100).toFixed(2)}%`;
                } else if (currentMode === 'underwrite') {
                    if (currentTradeAction === 'buy') {
                        const est = inputVal / probNO;
                        estEl.innerText = `${est.toFixed(2)}`;
                    } else {
                        const est = inputVal * probNO;
                        estEl.innerText = `${est.toFixed(2)}`;
                    }
                    premEl.innerText = `${impliedYield.toFixed(2)}% APY`;
                }
            } else {
                premEl.innerText = "Pool Empty";
                estEl.innerText = "0";
            }
        }

    } catch (e) {
        console.error("Stats update error", e);
    }
}

// ==========================================
// Admin Modal Logic
// ==========================================
async function openAdminModal(routerAddr, vaultAddr, name) {
    document.getElementById('adminModalTitle').innerText = `${name} - Admin Zone`;
    document.getElementById('adminModal').style.display = 'flex';

    // Load Contracts for specific admin pool in background
    try {
        magenRouter = await loadArtifact("MagenRouter", routerAddr);
        magenVault = await loadArtifact("MagenVault", vaultAddr);

        if (magenVault) {
            const siAddr = await magenVault.methods.tokenSI().call();
            const noAddr = await magenVault.methods.tokenNO().call();
            const siArt = await fetch(`../build/contracts/OutcomeToken.json`).then(r => r.json());
            outcomeSI = new web3.eth.Contract(siArt.abi, siAddr);
            outcomeNO = new web3.eth.Contract(siArt.abi, noAddr);
        }
    } catch (e) {
        console.error("Error loading admin contracts", e);
        updateStatus("Failed to load pool contracts", "error");
    }
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';

    // Reset inputs
    document.getElementById('resolveScale').value = '';
    document.getElementById('initAmount').value = '';
    document.getElementById('initRisk').value = '5';
    document.getElementById('initRiskDisplay').innerText = '5%';
}

async function initPool() {
    const amt = document.getElementById('initAmount').value;
    const risk = document.getElementById('initRisk').value;
    if (!amt || !risk) return;

    if (!magenRouter) {
        updateStatus("Error: Pool router not loaded", "error");
        return;
    }

    const weiAmt = web3.utils.toWei(amt, 'ether');
    const riskBN = web3.utils.toBN(risk);

    updateStatus("Approving USDC for Init...");
    try {
        await mockUSDC.methods.approve(magenRouter.options.address, weiAmt).send({ from: accounts[0] });
        updateStatus(`Initializing Pool with ${risk}% Risk...`);
        await magenRouter.methods.initialize(weiAmt, riskBN).send({ from: accounts[0] });
        updateStatus("Pool Initialized!", "success");
        closeAdminModal();
    } catch (e) {
        updateStatus("Init failed: " + e.message, "error");
    }
}

async function resolveMarket() {
    const scale = document.getElementById('resolveScale').value;
    if (!scale) return;

    // Check if vault is loaded
    if (!magenVault) {
        updateStatus("Error: Pool vault not loaded", "error");
        return;
    }

    const scaleBN = web3.utils.toBN(scale).mul(web3.utils.toBN(10).pow(web3.utils.toBN(16)));
    try {
        await magenVault.methods.resolve(scaleBN).send({ from: accounts[0] });
        updateStatus("Market Resolved!", "success");
        closeAdminModal();
    } catch (e) { updateStatus("Error: " + e.message, "error"); }
}

async function claimSI() {
    if (!magenVault || !outcomeSI) {
        updateStatus("Error: Pool tokens not loaded", "error");
        return;
    }

    try {
        const bal = await outcomeSI.methods.balanceOf(accounts[0]).call();
        if (bal > 0) {
            await magenVault.methods.claim(bal, true).send({ from: accounts[0] });
            updateStatus("Claimed All CT", "success");
            closeAdminModal();
        } else {
            updateStatus("No CT balance to claim", "error");
        }
    } catch (e) { updateStatus("Error: " + e.message, "error"); }
}

async function claimNO() {
    if (!magenVault || !outcomeNO) {
        updateStatus("Error: Pool tokens not loaded", "error");
        return;
    }

    try {
        const bal = await outcomeNO.methods.balanceOf(accounts[0]).call();
        if (bal > 0) {
            await magenVault.methods.claim(bal, false).send({ from: accounts[0] });
            updateStatus("Claimed All UT", "success");
            closeAdminModal();
        } else {
            updateStatus("No UT balance to claim", "error");
        }
    } catch (e) { updateStatus("Error: " + e.message, "error"); }
}

async function faucetUSDC() {
    if (!mockUSDC || !accounts) return;
    try {
        const amt = web3.utils.toWei('1000000', 'ether');
        updateStatus("Requesting Faucet...");
        await mockUSDC.methods.mint(accounts[0], amt).send({ from: accounts[0] });
        updateStatus("Faucet Success! +1,000,000 USDC", "success");
        updateStats(); // Refresh balances
    } catch (e) {
        console.error(e);
        updateStatus("Faucet Failed: " + e.message, "error");
    }
}

window.init = init;
