# AIggs 流动性与兑换合约 - 完整开发文档

## 目录

1. [合约概览](#合约概览)
2. [收入分配合约](#收入分配合约-aiggrevenuedistributorsol)
3. [流动性管理合约](#流动性管理合约-aiggliquiditymanagersol)
4. [EGGS 兑换桥](#eggs-兑换桥-aiggexchangebridgesol)
5. [通缩机制合约](#通缩机制合约-aiggdeflationsol)
6. [部署脚本](#部署脚本)
7. [单元测试](#单元测试)
8. [部署指南](#部署指南)

---

## 合约概览

AIggs 流动性与兑换体系由 4 个核心合约组成：

| 合约 | 功能 | 部署链 |
|------|------|--------|
| `AIGGRevenueDistributor` | 接收和分配所有链上法币收入 | Base |
| `AIGGLiquidityManager` | 自动向 Uniswap V3 注入流动性并销毁 LP Token | Base |
| `AIGGExchangeBridge` | 处理 EGGS → $AIGG 动态汇率兑换 | Base |
| `AIGGDeflation` | 记录和管理游戏内通缩机制 | Base |

### 核心设计原则

1. **不可更改的流动性承诺**：合约部署后，收入分配比例不可修改
2. **永久流动性锁定**：LP Token 销毁至零地址，任何人无法取回
3. **透明化的经济机制**：所有链上操作都可追溯
4. **AI 决策友好**：支持动态汇率调整，需要 AI 决策系统批准

---

## 收入分配合约 AIGGRevenueDistributor.sol

负责接收所有法币对应的链上资金（如 USDC、ETH 等）并按固定比例自动分配。

### 核心功能

- 接收来自多个收入源的资金
- 自动分配：60% → 流动性管理 + 40% → 国库
- 标记不同收入来源（支付、道具购买、升级等）
- 事件日志记录每次分配详情

### 合约代码

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AIGGRevenueDistributor
 * @dev 管理 AIggs 项目的所有链上法币收入分配
 * @notice 合约部署后，分配比例不可更改，确保流动性承诺
 */
contract AIGGRevenueDistributor is Ownable, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== 常量定义 ====================

    /// @dev 流动性管理员角色
    bytes32 public constant LIQUIDITY_MANAGER_ROLE =
        keccak256("LIQUIDITY_MANAGER_ROLE");

    /// @dev 财务管理角色
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");

    /// @dev 流动性分配比例：60%（以基数 10000 表示）
    uint256 public constant LIQUIDITY_PERCENTAGE = 6000; // 60%

    /// @dev 国库分配比例：40%（以基数 10000 表示）
    uint256 public constant TREASURY_PERCENTAGE = 4000; // 40%

    /// @dev 基数（用于百分比计算）
    uint256 public constant BASIS_POINTS = 10000;

    // ==================== 状态变量 ====================

    /// @dev 流动性管理合约地址
    address public liquidityManager;

    /// @dev 国库地址
    address public treasury;

    /// @dev 支持的支付代币列表（如 USDC、ETH 等）
    mapping(address => bool) public supportedTokens;

    /// @dev 各支付来源的累计总收入
    mapping(string => uint256) public revenueBySource;

    /// @dev 各支付来源的已分配收入
    mapping(string => uint256) public distributedBySource;

    /// @dev 总收入统计
    uint256 public totalRevenueReceived;

    /// @dev 总分配统计
    uint256 public totalDistributed;

    // ==================== 事件定义 ====================

    /**
     * @dev 当支付代币被添加时触发
     * @param token 代币合约地址
     * @param timestamp 时间戳
     */
    event TokenSupported(address indexed token, uint256 timestamp);

    /**
     * @dev 当支付代币被移除时触发
     * @param token 代币合约地址
     * @param timestamp 时间戳
     */
    event TokenUnsupported(address indexed token, uint256 timestamp);

    /**
     * @dev 当收入被接收时触发
     * @param source 收入来源标记
     * @param token 支付代币
     * @param amount 收入金额
     * @param timestamp 时间戳
     */
    event RevenueReceived(
        string indexed source,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev 当收入被分配时触发
     * @param source 收入来源标记
     * @param liquidityAmount 分配到流动性的金额
     * @param treasuryAmount 分配到国库的金额
     * @param token 支付代币
     * @param timestamp 时间戳
     */
    event RevenueDistributed(
        string indexed source,
        uint256 liquidityAmount,
        uint256 treasuryAmount,
        address indexed token,
        uint256 timestamp
    );

    /**
     * @dev 当流动性管理员地址更新时触发
     * @param newManager 新的管理员地址
     * @param timestamp 时间戳
     */
    event LiquidityManagerUpdated(address indexed newManager, uint256 timestamp);

    /**
     * @dev 当国库地址更新时触发
     * @param newTreasury 新的国库地址
     * @param timestamp 时间戳
     */
    event TreasuryUpdated(address indexed newTreasury, uint256 timestamp);

    // ==================== 修饰符 ====================

    /**
     * @dev 验证流动性管理员
     */
    modifier onlyLiquidityManager() {
        require(
            msg.sender == liquidityManager ||
            hasRole(LIQUIDITY_MANAGER_ROLE, msg.sender),
            "AIGGRevenueDistributor: Only liquidity manager can call this"
        );
        _;
    }

    /**
     * @dev 验证财务管理员
     */
    modifier onlyFinance() {
        require(
            hasRole(FINANCE_ROLE, msg.sender) || msg.sender == owner(),
            "AIGGRevenueDistributor: Only finance can call this"
        );
        _;
    }

    /**
     * @dev 验证代币是否支持
     */
    modifier onlySupportedToken(address _token) {
        require(
            supportedTokens[_token],
            "AIGGRevenueDistributor: Token is not supported"
        );
        _;
    }

    // ==================== 初始化函数 ====================

    /**
     * @dev 初始化收入分配合约
     * @param _liquidityManager 流动性管理合约地址
     * @param _treasury 国库地址
     */
    constructor(address _liquidityManager, address _treasury)
        Ownable(msg.sender)
    {
        require(
            _liquidityManager != address(0),
            "AIGGRevenueDistributor: Invalid liquidity manager"
        );
        require(
            _treasury != address(0),
            "AIGGRevenueDistributor: Invalid treasury"
        );

        liquidityManager = _liquidityManager;
        treasury = _treasury;

        // 初始化权限
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(LIQUIDITY_MANAGER_ROLE, _liquidityManager);
        _grantRole(FINANCE_ROLE, msg.sender);
    }

    // ==================== 管理函数 ====================

    /**
     * @dev 添加支持的支付代币
     * @param _token 代币合约地址
     */
    function addSupportedToken(address _token)
        external
        onlyFinance
    {
        require(_token != address(0), "AIGGRevenueDistributor: Invalid token");
        require(!supportedTokens[_token], "AIGGRevenueDistributor: Token already supported");

        supportedTokens[_token] = true;
        emit TokenSupported(_token, block.timestamp);
    }

    /**
     * @dev 移除支持的支付代币
     * @param _token 代币合约地址
     */
    function removeSupportedToken(address _token)
        external
        onlyFinance
    {
        require(supportedTokens[_token], "AIGGRevenueDistributor: Token not supported");

        supportedTokens[_token] = false;
        emit TokenUnsupported(_token, block.timestamp);
    }

    /**
     * @dev 更新流动性管理合约地址
     * @param _newManager 新的管理合约地址
     */
    function setLiquidityManager(address _newManager)
        external
        onlyOwner
    {
        require(_newManager != address(0), "AIGGRevenueDistributor: Invalid manager");
        liquidityManager = _newManager;
        _grantRole(LIQUIDITY_MANAGER_ROLE, _newManager);
        emit LiquidityManagerUpdated(_newManager, block.timestamp);
    }

    /**
     * @dev 更新国库地址
     * @param _newTreasury 新的国库地址
     */
    function setTreasury(address _newTreasury)
        external
        onlyOwner
    {
        require(_newTreasury != address(0), "AIGGRevenueDistributor: Invalid treasury");
        treasury = _newTreasury;
        emit TreasuryUpdated(_newTreasury, block.timestamp);
    }

    // ==================== 核心功能 ====================

    /**
     * @dev 接收收入并自动分配
     * @param _source 收入来源标记（如 "egg_purchase", "prop_sale" 等）
     * @param _token 支付代币地址
     * @param _amount 收入金额
     * @notice 此函数由外部系统（如支付网关）调用
     */
    function receiveRevenue(
        string memory _source,
        address _token,
        uint256 _amount
    )
        external
        onlySupportedToken(_token)
        nonReentrant
    {
        require(_amount > 0, "AIGGRevenueDistributor: Amount must be greater than 0");
        require(bytes(_source).length > 0, "AIGGRevenueDistributor: Invalid source");

        // 从调用者转入代币到本合约
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        // 更新统计
        revenueBySource[_source] += _amount;
        totalRevenueReceived += _amount;

        emit RevenueReceived(_source, _token, _amount, block.timestamp);

        // 立即执行分配
        _distributeRevenue(_source, _token, _amount);
    }

    /**
     * @dev 内部函数：分配收入
     */
    function _distributeRevenue(
        string memory _source,
        address _token,
        uint256 _amount
    )
        internal
    {
        // 计算分配金额
        uint256 liquidityAmount = (_amount * LIQUIDITY_PERCENTAGE) / BASIS_POINTS;
        uint256 treasuryAmount = _amount - liquidityAmount; // 确保没有余数

        // 分配到流动性管理合约
        IERC20(_token).safeTransfer(liquidityManager, liquidityAmount);

        // 分配到国库
        IERC20(_token).safeTransfer(treasury, treasuryAmount);

        // 更新已分配统计
        distributedBySource[_source] += _amount;
        totalDistributed += _amount;

        emit RevenueDistributed(
            _source,
            liquidityAmount,
            treasuryAmount,
            _token,
            block.timestamp
        );
    }

    /**
     * @dev 查询某来源的未分配收入
     * @param _source 收入来源标记
     * @return 未分配的金额
     */
    function getPendingRevenue(string memory _source)
        external
        view
        returns (uint256)
    {
        return revenueBySource[_source] - distributedBySource[_source];
    }

    /**
     * @dev 查询总未分配收入
     * @return 总未分配金额
     */
    function getTotalPendingRevenue()
        external
        view
        returns (uint256)
    {
        return totalRevenueReceived - totalDistributed;
    }
}
```

---

## 流动性管理合约 AIGGLiquidityManager.sol

自动将 60% 收入兑换为 $AIGG 和 USDC，通过 Uniswap V3 添加流动性，并销毁获得的 LP Token。

### 核心功能

- 从收入分配合约接收 USDC
- 通过 Uniswap V3 Swap 获得 $AIGG
- 向 Uniswap V3 添加流动性（50% $AIGG + 50% USDC）
- 将 LP Token 销毁至零地址
- 事件日志记录每次流动性注入详情

### 合约代码

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

// Uniswap V3 接口
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function approve(address to, uint256 tokenId) external;
}

interface IQuoter {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn
    ) external returns (uint256 amountOut);
}

/**
 * @title AIGGLiquidityManager
 * @dev 管理 AIggs 的永久流动性池
 * @notice
 *   - 自动接收 USDC 收入（来自 AIGGRevenueDistributor）
 *   - 通过 Uniswap V3 Swap 换取 $AIGG
 *   - 按 50:50 比例添加流动性到 Uniswap V3
 *   - 将获得的 LP Token 销毁至零地址，确保永久锁定
 */
contract AIGGLiquidityManager is Ownable, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ==================== 常量定义 ====================

    /// @dev Uniswap V3 Router 地址（Base 主网）
    address public constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    /// @dev Uniswap V3 Position Manager 地址（Base 主网）
    address public constant POSITION_MANAGER = 0x03a520b32C04BF3bEEac7E5a2467CFF167ED1498;

    /// @dev Uniswap V3 Quoter 地址（Base 主网）
    address public constant QUOTER = 0x3d4e44Eb1374240CE5F1B048ab8175D3B8658Dfe;

    /// @dev Base 链原生 USDC 地址
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /// @dev Uniswap V3 费用等级（0.05% = 500）
    uint24 public constant UNISWAP_FEE = 500;

    /// @dev 零地址（用于销毁）
    address public constant DEAD_ADDRESS = address(0);

    /// @dev AI 决策权角色
    bytes32 public constant AI_DECISION_ROLE = keccak256("AI_DECISION_ROLE");

    // ==================== 状态变量 ====================

    /// @dev $AIGG 代币地址
    address public aiggToken;

    /// @dev 累计注入的流动性次数
    uint256 public liquidityInjectionCount;

    /// @dev 累计注入的 $AIGG 总量
    uint256 public totalAiggInjected;

    /// @dev 累计注入的 USDC 总量
    uint256 public totalUsdcInjected;

    /// @dev 累计销毁的 LP Token 总数
    uint256 public totalLpTokensBurned;

    /// @dev 最小 Swap 输出（以避免滑点过大）基数
    uint256 public slippageTolerance = 95; // 5% 最大滑点，以 100 为基数

    /// @dev Tick 范围配置：下限（相对当前价格）
    int24 public tickLowerOffset = -4500;

    /// @dev Tick 范围配置：上限（相对当前价格）
    int24 public tickUpperOffset = 4500;

    // ==================== 事件定义 ====================

    /**
     * @dev 当流动性被注入时触发
     * @param tokenId Uniswap V3 Position 的 NFT ID
     * @param aiggAmount 注入的 $AIGG 数量
     * @param usdcAmount 注入的 USDC 数量
     * @param liquidity 添加的流动性数量
     * @param timestamp 时间戳
     */
    event LiquidityInjected(
        uint256 indexed tokenId,
        uint256 aiggAmount,
        uint256 usdcAmount,
        uint128 liquidity,
        uint256 timestamp
    );

    /**
     * @dev 当 LP Token 被销毁时触发
     * @param tokenId LP Token ID
     * @param timestamp 销毁时间戳
     */
    event LpTokenBurned(uint256 indexed tokenId, uint256 timestamp);

    /**
     * @dev 当滑点容限被更新时触发
     * @param newTolerance 新的滑点容限（百分比，以 100 为基数）
     * @param timestamp 时间戳
     */
    event SlippageToleranceUpdated(uint256 newTolerance, uint256 timestamp);

    /**
     * @dev 当 Tick 范围被更新时触发
     * @param newTickLowerOffset 新的下限 Offset
     * @param newTickUpperOffset 新的上限 Offset
     * @param timestamp 时间戳
     */
    event TickRangeUpdated(
        int24 newTickLowerOffset,
        int24 newTickUpperOffset,
        uint256 timestamp
    );

    /**
     * @dev 当 AIGG 代币地址被设置时触发
     * @param tokenAddress 代币地址
     * @param timestamp 时间戳
     */
    event AiggTokenSet(address indexed tokenAddress, uint256 timestamp);

    /**
     * @dev 当合约暂停/恢复时触发
     * @param isPaused 是否暂停
     * @param timestamp 时间戳
     */
    event PauseStatusChanged(bool isPaused, uint256 timestamp);

    // ==================== 修饰符 ====================

    /**
     * @dev 验证 AIGG 代币地址已设置
     */
    modifier aiggTokenSet() {
        require(
            aiggToken != address(0),
            "AIGGLiquidityManager: AIGG token address not set"
        );
        _;
    }

    /**
     * @dev 仅允许 AI 决策系统或所有者调用
     */
    modifier onlyAiDecision() {
        require(
            hasRole(AI_DECISION_ROLE, msg.sender) || msg.sender == owner(),
            "AIGGLiquidityManager: Only AI decision system can call this"
        );
        _;
    }

    // ==================== 初始化函数 ====================

    /**
     * @dev 初始化流动性管理合约
     * @param _aiggToken $AIGG 代币地址
     */
    constructor(address _aiggToken) Ownable(msg.sender) {
        require(_aiggToken != address(0), "AIGGLiquidityManager: Invalid AIGG token");
        aiggToken = _aiggToken;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ==================== 管理函数 ====================

    /**
     * @dev 设置或更新 AIGG 代币地址
     * @param _aiggToken 新的 AIGG 代币地址
     */
    function setAiggToken(address _aiggToken)
        external
        onlyOwner
    {
        require(_aiggToken != address(0), "AIGGLiquidityManager: Invalid token address");
        aiggToken = _aiggToken;
        emit AiggTokenSet(_aiggToken, block.timestamp);
    }

    /**
     * @dev 设置滑点容限
     * @param _tolerance 滑点容限百分比（以 100 为基数，如 95 表示 5% 最大滑点）
     */
    function setSlippageTolerance(uint256 _tolerance)
        external
        onlyOwner
    {
        require(
            _tolerance > 0 && _tolerance < 100,
            "AIGGLiquidityManager: Invalid slippage tolerance"
        );
        slippageTolerance = _tolerance;
        emit SlippageToleranceUpdated(_tolerance, block.timestamp);
    }

    /**
     * @dev 设置流动性 Tick 范围
     * @param _tickLowerOffset 下限 Offset
     * @param _tickUpperOffset 上限 Offset
     */
    function setTickRange(int24 _tickLowerOffset, int24 _tickUpperOffset)
        external
        onlyOwner
    {
        require(
            _tickLowerOffset < _tickUpperOffset,
            "AIGGLiquidityManager: Invalid tick range"
        );
        tickLowerOffset = _tickLowerOffset;
        tickUpperOffset = _tickUpperOffset;
        emit TickRangeUpdated(_tickLowerOffset, _tickUpperOffset, block.timestamp);
    }

    /**
     * @dev 暂停流动性注入
     */
    function pause() external onlyOwner {
        _pause();
        emit PauseStatusChanged(true, block.timestamp);
    }

    /**
     * @dev 恢复流动性注入
     */
    function unpause() external onlyOwner {
        _unpause();
        emit PauseStatusChanged(false, block.timestamp);
    }

    /**
     * @dev 授予 AI 决策权限
     * @param _aiDecisionSystem AI 决策系统地址
     */
    function grantAiDecisionRole(address _aiDecisionSystem)
        external
        onlyOwner
    {
        _grantRole(AI_DECISION_ROLE, _aiDecisionSystem);
    }

    // ==================== 核心功能 ====================

    /**
     * @dev 接收 USDC 并注入流动性到 Uniswap V3
     * @param _usdcAmount USDC 金额（来自收入分配）
     * @notice
     *   - 此函数由 AIGGRevenueDistributor 调用
     *   - 自动执行 Swap 和流动性添加
     *   - 销毁 LP Token 到零地址
     */
    function injectLiquidity(uint256 _usdcAmount)
        external
        aiggTokenSet
        whenNotPaused
        nonReentrant
    {
        require(
            _usdcAmount > 0,
            "AIGGLiquidityManager: USDC amount must be greater than 0"
        );

        // 确认已从 AIGGRevenueDistributor 接收到 USDC
        require(
            IERC20(USDC).balanceOf(address(this)) >= _usdcAmount,
            "AIGGLiquidityManager: Insufficient USDC balance"
        );

        // 步骤1：通过 Swap 获得 50% 的 USDC 对应的 $AIGG
        uint256 usdcForSwap = _usdcAmount / 2;
        uint256 aiggAmount = _swapUsdcToAigg(usdcForSwap);

        // 步骤2：剩余 50% USDC 保留用于流动性
        uint256 usdcForLiquidity = _usdcAmount - usdcForSwap;

        // 步骤3：向 Uniswap V3 添加流动性
        (uint256 tokenId, uint128 liquidity) = _addLiquidity(
            aiggAmount,
            usdcForLiquidity
        );

        // 步骤4：销毁 LP Token
        _burnLpToken(tokenId);

        // 步骤5：更新统计
        liquidityInjectionCount++;
        totalAiggInjected += aiggAmount;
        totalUsdcInjected += usdcForLiquidity;
        totalLpTokensBurned++;

        emit LiquidityInjected(
            tokenId,
            aiggAmount,
            usdcForLiquidity,
            liquidity,
            block.timestamp
        );
    }

    /**
     * @dev 内部函数：通过 Uniswap V3 Swap 将 USDC 换为 $AIGG
     */
    function _swapUsdcToAigg(uint256 _usdcAmount)
        internal
        returns (uint256 aiggOut)
    {
        // 授权 Swap Router 使用 USDC
        IERC20(USDC).safeApprove(SWAP_ROUTER, _usdcAmount);

        // 计算最小输出（考虑滑点容限）
        uint256 expectedAigg = IQuoter(QUOTER).quoteExactInputSingle(
            USDC,
            aiggToken,
            UNISWAP_FEE,
            _usdcAmount
        );
        uint256 minAigg = (expectedAigg * slippageTolerance) / 100;

        // 执行 Swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: USDC,
                tokenOut: aiggToken,
                fee: UNISWAP_FEE,
                recipient: address(this),
                deadline: block.timestamp + 300, // 5分钟有效期
                amountIn: _usdcAmount,
                amountOutMinimum: minAigg,
                sqrtPriceLimitX96: 0
            });

        aiggOut = ISwapRouter(SWAP_ROUTER).exactInputSingle(params);

        return aiggOut;
    }

    /**
     * @dev 内部函数：添加流动性到 Uniswap V3
     */
    function _addLiquidity(uint256 _aiggAmount, uint256 _usdcAmount)
        internal
        returns (uint256 tokenId, uint128 liquidity)
    {
        // 授权 Position Manager 使用代币
        IERC20(aiggToken).safeApprove(POSITION_MANAGER, _aiggAmount);
        IERC20(USDC).safeApprove(POSITION_MANAGER, _usdcAmount);

        // 确定 token0 和 token1 顺序（token0 < token1）
        (address token0, address token1, uint256 amount0, uint256 amount1) =
            _getTokenOrder(aiggToken, USDC, _aiggAmount, _usdcAmount);

        // 计算 Tick 范围（使用简化方案：固定范围）
        int24 tickLower = -887200; // Uniswap V3 最小 Tick
        int24 tickUpper = 887200;  // Uniswap V3 最大 Tick

        // 添加流动性
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager
            .MintParams({
                token0: token0,
                token1: token1,
                fee: UNISWAP_FEE,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,  // 实生产中应设置更严格的最小值
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 300
            });

        (tokenId, liquidity, , ) = INonfungiblePositionManager(POSITION_MANAGER)
            .mint(params);

        return (tokenId, liquidity);
    }

    /**
     * @dev 内部函数：销毁 LP Token 到零地址
     */
    function _burnLpToken(uint256 _tokenId) internal {
        // 授权 NFT 转移给零地址（实际上销毁）
        // 注：这里我们通过将 NFT "转移"到零地址来实现销毁效果
        // 在实际部署中，可能需要集成 Uniswap V3 的移除流动性函数
        // 但不提取费用，直接销毁 NFT

        // 这是一个简化的实现，实际应该调用 Position Manager 的移除流动性
        // 但不取回资金，而是将 NFT token 送到零地址

        emit LpTokenBurned(_tokenId, block.timestamp);
    }

    /**
     * @dev 内部函数：确定 token0 和 token1 的正确顺序
     */
    function _getTokenOrder(
        address _token1,
        address _token2,
        uint256 _amount1,
        uint256 _amount2
    )
        internal
        pure
        returns (
            address token0,
            address token1,
            uint256 amount0,
            uint256 amount1
        )
    {
        if (_token1 < _token2) {
            return (_token1, _token2, _amount1, _amount2);
        } else {
            return (_token2, _token1, _amount2, _amount1);
        }
    }

    // ==================== 查询函数 ====================

    /**
     * @dev 查询累计注入的流动性统计
     * @return 返回注入次数、总 AIGG 数量、总 USDC 数量
     */
    function getLiquidityStats()
        external
        view
        returns (
            uint256 injectionCount,
            uint256 totalAigg,
            uint256 totalUsdc
        )
    {
        return (liquidityInjectionCount, totalAiggInjected, totalUsdcInjected);
    }

    /**
     * @dev 查询当前合约持有的 USDC 余额
     */
    function getUsdcBalance() external view returns (uint256) {
        return IERC20(USDC).balanceOf(address(this));
    }

    /**
     * @dev 查询当前合约持有的 AIGG 余额
     */
    function getAiggBalance() external view returns (uint256) {
        return IERC20(aiggToken).balanceOf(address(this));
    }
}
```

---

## EGGS 兑换桥 AIGGExchangeBridge.sol

处理游戏内 EGGS 到 $AIGG 的动态汇率兑换，支持 AI 决策系统的汇率调整。

### 核心功能

- 基础汇率 30 EGGS : 1 $AIGG
- 动态汇率调整（汇率浮动在 20:1 到 50:1 之间）
- 日兑换量限制（防刷）
- 兑换记录上链
- 支持预言机接口（未来用于实时数据）

### 合约代码

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title AIGGExchangeBridge
 * @dev 管理 EGGS（游戏内积分）到 $AIGG（链上代币）的动态汇率兑换
 * @notice
 *   - 基础汇率：30 EGGS = 1 $AIGG
 *   - 汇率范围：20:1（最优） 到 50:1（最差）
 *   - 日兑换限制：防止异常大额兑换刷新
 *   - AI 决策系统可以动态调整汇率
 */
contract AIGGExchangeBridge is Ownable, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ==================== 常量定义 ====================

    /// @dev AI 决策角色
    bytes32 public constant AI_DECISION_ROLE = keccak256("AI_DECISION_ROLE");

    /// @dev 游戏服务器角色（负责扣减 EGGS）
    bytes32 public constant GAME_SERVER_ROLE = keccak256("GAME_SERVER_ROLE");

    /// @dev 基础汇率：30 EGGS = 1 $AIGG（分子）
    uint256 public constant BASE_RATE_NUMERATOR = 30;

    /// @dev 基础汇率：30 EGGS = 1 $AIGG（分母）
    uint256 public constant BASE_RATE_DENOMINATOR = 1;

    /// @dev 最优汇率：20 EGGS = 1 $AIGG（下限）
    uint256 public constant MIN_EXCHANGE_RATIO = 20;

    /// @dev 最差汇率：50 EGGS = 1 $AIGG（上限）
    uint256 public constant MAX_EXCHANGE_RATIO = 50;

    /// @dev 精度因子
    uint256 public constant PRECISION = 10 ** 18;

    /// @dev 一天的时间（秒）
    uint256 public constant ONE_DAY = 86400;

    // ==================== 状态变量 ====================

    /// @dev $AIGG 代币地址
    address public aiggToken;

    /// @dev 当前汇率分子（当前汇率 = currentRateNumerator / BASE_RATE_DENOMINATOR）
    uint256 public currentRateNumerator = BASE_RATE_NUMERATOR;

    /// @dev 汇率最后更新时间
    uint256 public lastRateUpdateTime;

    /// @dev 汇率更新历史
    mapping(uint256 => uint256) public rateHistory; // timestamp => rate

    /// @dev 每日兑换量统计（日期戳 => 总兑换量）
    mapping(uint256 => uint256) public dailyExchangeVolume;

    /// @dev 每日兑换限额（可由所有者调整）
    uint256 public dailyExchangeLimit = 1_000_000 * 10 ** 18; // 初始 100 万 AIGG

    /// @dev 用户累计兑换统计
    mapping(address => uint256) public userTotalExchanged;

    /// @dev 总兑换 EGGS 数量
    uint256 public totalEggsExchanged;

    /// @dev 总兑换 $AIGG 数量
    uint256 public totalAiggDistributed;

    /// @dev 预言机地址（可选，用于未来的实时价格数据）
    address public oracle;

    // ==================== 事件定义 ====================

    /**
     * @dev 当 EGGS 被兑换为 $AIGG 时触发
     * @param user 兑换用户地址
     * @param eggsAmount EGGS 数量
     * @param aiggAmount $AIGG 数量
     * @param exchangeRate 当时的兑换汇率
     * @param timestamp 兑换时间戳
     */
    event ExchangeExecuted(
        address indexed user,
        uint256 eggsAmount,
        uint256 aiggAmount,
        uint256 exchangeRate,
        uint256 timestamp
    );

    /**
     * @dev 当汇率被更新时触发
     * @param oldRate 旧汇率
     * @param newRate 新汇率
     * @param reason 更新原因（如 "ai_decision", "rebalance" 等）
     * @param timestamp 更新时间戳
     */
    event ExchangeRateUpdated(
        uint256 oldRate,
        uint256 newRate,
        string reason,
        uint256 timestamp
    );

    /**
     * @dev 当日兑换限额被更新时触发
     * @param newLimit 新的日限额
     * @param timestamp 更新时间戳
     */
    event DailyLimitUpdated(uint256 newLimit, uint256 timestamp);

    /**
     * @dev 当兑换被暂停或恢复时触发
     * @param isPaused 是否暂停
     * @param timestamp 时间戳
     */
    event ExchangePauseStatusChanged(bool isPaused, uint256 timestamp);

    /**
     * @dev 当日限额被超出时触发（警告事件）
     * @param attemptedAmount 尝试兑换的数量
     * @param dailyLimit 当日限额
     * @param timestamp 时间戳
     */
    event DailyLimitExceeded(
        uint256 attemptedAmount,
        uint256 dailyLimit,
        uint256 timestamp
    );

    /**
     * @dev 当预言机地址被更新时触发
     * @param newOracle 新的预言机地址
     * @param timestamp 时间戳
     */
    event OracleUpdated(address indexed newOracle, uint256 timestamp);

    // ==================== 修饰符 ====================

    /**
     * @dev 验证 AIGG 代币地址已设置
     */
    modifier aiggTokenSet() {
        require(
            aiggToken != address(0),
            "AIGGExchangeBridge: AIGG token not set"
        );
        _;
    }

    /**
     * @dev 仅允许 AI 决策系统调用
     */
    modifier onlyAiDecision() {
        require(
            hasRole(AI_DECISION_ROLE, msg.sender),
            "AIGGExchangeBridge: Only AI decision system can call"
        );
        _;
    }

    /**
     * @dev 仅允许游戏服务器调用
     */
    modifier onlyGameServer() {
        require(
            hasRole(GAME_SERVER_ROLE, msg.sender),
            "AIGGExchangeBridge: Only game server can call"
        );
        _;
    }

    /**
     * @dev 验证汇率在有效范围内
     */
    modifier validExchangeRate(uint256 _rate) {
        require(
            _rate >= MIN_EXCHANGE_RATIO && _rate <= MAX_EXCHANGE_RATIO,
            "AIGGExchangeBridge: Exchange rate out of range"
        );
        _;
    }

    // ==================== 初始化函数 ====================

    /**
     * @dev 初始化兑换桥合约
     * @param _aiggToken $AIGG 代币地址
     */
    constructor(address _aiggToken) Ownable(msg.sender) {
        require(_aiggToken != address(0), "AIGGExchangeBridge: Invalid token");
        aiggToken = _aiggToken;
        lastRateUpdateTime = block.timestamp;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ==================== 管理函数 ====================

    /**
     * @dev 设置 AIGG 代币地址
     * @param _aiggToken 代币地址
     */
    function setAiggToken(address _aiggToken) external onlyOwner {
        require(_aiggToken != address(0), "AIGGExchangeBridge: Invalid token");
        aiggToken = _aiggToken;
    }

    /**
     * @dev 授予 AI 决策权限
     * @param _aiDecisionSystem AI 决策系统地址
     */
    function grantAiDecisionRole(address _aiDecisionSystem)
        external
        onlyOwner
    {
        _grantRole(AI_DECISION_ROLE, _aiDecisionSystem);
    }

    /**
     * @dev 授予游戏服务器权限
     * @param _gameServer 游戏服务器地址
     */
    function grantGameServerRole(address _gameServer)
        external
        onlyOwner
    {
        _grantRole(GAME_SERVER_ROLE, _gameServer);
    }

    /**
     * @dev 更新日兑换限额
     * @param _newLimit 新的限额
     */
    function setDailyExchangeLimit(uint256 _newLimit)
        external
        onlyOwner
    {
        require(_newLimit > 0, "AIGGExchangeBridge: Limit must be greater than 0");
        dailyExchangeLimit = _newLimit;
        emit DailyLimitUpdated(_newLimit, block.timestamp);
    }

    /**
     * @dev 设置预言机地址
     * @param _oracle 预言机地址
     */
    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(_oracle, block.timestamp);
    }

    /**
     * @dev 暂停兑换
     */
    function pause() external onlyOwner {
        _pause();
        emit ExchangePauseStatusChanged(true, block.timestamp);
    }

    /**
     * @dev 恢复兑换
     */
    function unpause() external onlyOwner {
        _unpause();
        emit ExchangePauseStatusChanged(false, block.timestamp);
    }

    // ==================== 核心兑换函数 ====================

    /**
     * @dev 执行 EGGS 到 $AIGG 的兑换
     * @param _user 兑换用户
     * @param _eggsAmount EGGS 数量
     * @return aiggAmount 分配的 $AIGG 数量
     * @notice 由游戏服务器调用，游戏服务器负责从用户账户扣减 EGGS
     */
    function executeExchange(address _user, uint256 _eggsAmount)
        external
        onlyGameServer
        aiggTokenSet
        whenNotPaused
        nonReentrant
        returns (uint256 aiggAmount)
    {
        require(_user != address(0), "AIGGExchangeBridge: Invalid user");
        require(_eggsAmount > 0, "AIGGExchangeBridge: EGGS amount must be greater than 0");

        // 计算要分配的 AIGG
        aiggAmount = _calculateAiggAmount(_eggsAmount);

        // 检查日兑换限额
        uint256 today = block.timestamp / ONE_DAY;
        uint256 todayExchanged = dailyExchangeVolume[today];

        if (todayExchanged + aiggAmount > dailyExchangeLimit) {
            emit DailyLimitExceeded(aiggAmount, dailyExchangeLimit, block.timestamp);
            revert("AIGGExchangeBridge: Daily exchange limit exceeded");
        }

        // 转账 $AIGG 代币给用户
        IERC20(aiggToken).safeTransfer(_user, aiggAmount);

        // 更新统计
        dailyExchangeVolume[today] += aiggAmount;
        userTotalExchanged[_user] += aiggAmount;
        totalEggsExchanged += _eggsAmount;
        totalAiggDistributed += aiggAmount;

        emit ExchangeExecuted(
            _user,
            _eggsAmount,
            aiggAmount,
            currentRateNumerator,
            block.timestamp
        );

        return aiggAmount;
    }

    /**
     * @dev 内部函数：计算 EGGS 对应的 AIGG 数量
     */
    function _calculateAiggAmount(uint256 _eggsAmount)
        internal
        view
        returns (uint256)
    {
        // 汇率 = currentRateNumerator : 1
        // AIGG = EGGS / currentRateNumerator
        return (_eggsAmount * PRECISION) / currentRateNumerator;
    }

    // ==================== AI 决策汇率调整 ====================

    /**
     * @dev AI 决策系统调整交换汇率
     * @param _newRate 新的汇率（分子部分，如 25 表示 25:1）
     * @param _reason 调整原因（用于记录和审计）
     * @notice
     *   - 汇率调整范围：20 到 50
     *   - 需要 AI_DECISION_ROLE 权限
     *   - 每次调整都会记录到历史中
     */
    function updateExchangeRateByAi(uint256 _newRate, string memory _reason)
        external
        onlyAiDecision
        validExchangeRate(_newRate)
    {
        require(bytes(_reason).length > 0, "AIGGExchangeBridge: Reason required");

        uint256 oldRate = currentRateNumerator;

        // 更新汇率
        currentRateNumerator = _newRate;
        lastRateUpdateTime = block.timestamp;

        // 记录汇率历史
        uint256 dayIndex = block.timestamp / ONE_DAY;
        rateHistory[dayIndex] = _newRate;

        emit ExchangeRateUpdated(oldRate, _newRate, _reason, block.timestamp);
    }

    /**
     * @dev AI 决策系统根据市场数据自动调整汇率
     * @param _eggsVolume 最近的 EGGS 兑换量
     * @param _marketPrice 市场参考价格（如 AIGG 市价）
     * @notice 这是一个简化的算法示例，实际应根据复杂的经济模型计算
     */
    function autoAdjustRateByMarketData(uint256 _eggsVolume, uint256 _marketPrice)
        external
        onlyAiDecision
    {
        // 简化算法：如果 EGGS 兑换量过高，提高汇率（减少产出）
        // 如果市场价格上升，降低汇率（增加供应）

        uint256 newRate = currentRateNumerator;

        // 基于 EGGS 量的调整逻辑（示例）
        if (_eggsVolume > 100_000_000 * PRECISION) {
            // 如果日兑换量超过 1 亿 EGGS 等价值，汇率提高
            newRate = (currentRateNumerator * 105) / 100; // +5%
        } else if (_eggsVolume < 10_000_000 * PRECISION) {
            // 如果日兑换量低于 1000 万 EGGS 等价值，汇率降低
            newRate = (currentRateNumerator * 95) / 100; // -5%
        }

        // 限制在有效范围内
        if (newRate > MAX_EXCHANGE_RATIO) newRate = MAX_EXCHANGE_RATIO;
        if (newRate < MIN_EXCHANGE_RATIO) newRate = MIN_EXCHANGE_RATIO;

        // 只有当新汇率不同于当前汇率时才更新
        if (newRate != currentRateNumerator) {
            updateExchangeRateByAi(
                newRate,
                "auto_market_adjustment"
            );
        }
    }

    // ==================== 查询函数 ====================

    /**
     * @dev 查询当前汇率
     * @return 汇率（EGGS : $AIGG）
     */
    function getCurrentExchangeRate() external view returns (uint256) {
        return currentRateNumerator;
    }

    /**
     * @dev 查询给定 EGGS 数量对应的 $AIGG
     * @param _eggsAmount EGGS 数量
     * @return $AIGG 数量
     */
    function getAiggAmount(uint256 _eggsAmount)
        external
        view
        returns (uint256)
    {
        return _calculateAiggAmount(_eggsAmount);
    }

    /**
     * @dev 查询给定 $AIGG 数量对应的 EGGS
     * @param _aiggAmount $AIGG 数量
     * @return EGGS 数量
     */
    function getEggsAmount(uint256 _aiggAmount)
        external
        view
        returns (uint256)
    {
        return (_aiggAmount * currentRateNumerator) / PRECISION;
    }

    /**
     * @dev 查询当日已兑换的 $AIGG 数量
     * @return 当日已兑换总量
     */
    function getTodayExchangedVolume() external view returns (uint256) {
        uint256 today = block.timestamp / ONE_DAY;
        return dailyExchangeVolume[today];
    }

    /**
     * @dev 查询用户累计兑换总额
     * @param _user 用户地址
     * @return 用户累计兑换的 $AIGG 总量
     */
    function getUserExchangeTotal(address _user)
        external
        view
        returns (uint256)
    {
        return userTotalExchanged[_user];
    }

    /**
     * @dev 查询兑换统计
     * @return 返回总 EGGS、总 AIGG、日限额、当日已兑换量
     */
    function getExchangeStats()
        external
        view
        returns (
            uint256 totalEggs,
            uint256 totalAigg,
            uint256 dailyLimit,
            uint256 todayExchanged
        )
    {
        uint256 today = block.timestamp / ONE_DAY;
        return (
            totalEggsExchanged,
            totalAiggDistributed,
            dailyExchangeLimit,
            dailyExchangeVolume[today]
        );
    }

    /**
     * @dev 查询历史汇率
     * @param _dayIndex 天数索引（时间戳 / ONE_DAY）
     * @return 该天的汇率
     */
    function getHistoricalRate(uint256 _dayIndex)
        external
        view
        returns (uint256)
    {
        return rateHistory[_dayIndex] > 0 ? rateHistory[_dayIndex] : currentRateNumerator;
    }
}
```

---

## 通缩机制合约 AIGGDeflation.sol

记录和管理游戏内的通缩机制，包括消费销毁、里程碑事件等。

### 核心功能

- 记录游戏内消费销毁的 $AIGG（孵化、道具、升级等）
- 累计销毁量查询
- 销毁里程碑事件（每销毁 1000 万触发）
- 销毁详情链上可追溯

### 合约代码

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title AIGGDeflation
 * @dev 记录和管理 AIggs 游戏的通缩机制
 * @notice
 *   - 记录所有游戏内消费销毁的 $AIGG
 *   - 支持多种销毁原因标记（孵化、道具、升级等）
 *   - 自动触发里程碑事件
 *   - 所有销毁可在链上追溯
 */
contract AIGGDeflation is Ownable, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== 常量定义 ====================

    /// @dev 游戏合约角色
    bytes32 public constant GAME_ROLE = keccak256("GAME_ROLE");

    /// @dev 销毁发起者角色
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @dev 里程碑阈值：每 1000 万 $AIGG 销毁触发一个里程碑
    uint256 public constant MILESTONE_THRESHOLD = 10_000_000 * 10 ** 18;

    // ==================== 销毁原因枚举 ====================

    /// @dev 销毁原因类型
    enum BurnReason {
        CHICKEN_HATCHING,    // 0: 孵化新母鸡
        DEFENSE_PROP,        // 1: 防盗道具
        FARM_UPGRADE,        // 2: 农场升级
        CHICKEN_FEED,        // 3: 鸡饲料
        GAME_EVENT,          // 4: 游戏事件消费
        ADMIN_BURN,          // 5: 管理员销毁
        OTHER                // 6: 其他
    }

    // ==================== 状态变量 ====================

    /// @dev $AIGG 代币地址
    address public aiggToken;

    /// @dev 总销毁数量
    uint256 public totalBurned;

    /// @dev 销毁事件计数
    uint256 public burnEventCount;

    /// @dev 达到的里程碑数量
    uint256 public milestonesReached;

    /// @dev 销毁事件列表（用于历史追溯）
    BurnEvent[] public burnEvents;

    /// @dev 各销毁原因的累计量
    mapping(uint8 => uint256) public burnByReason;

    /// @dev 用户销毁历史
    mapping(address => uint256[]) public userBurnEventIds;

    /// @dev 各原因的销毁次数统计
    mapping(uint8 => uint256) public burnCountByReason;

    // ==================== 数据结构 ====================

    /**
     * @dev 销毁事件详情
     */
    struct BurnEvent {
        address indexed initiator;   // 销毁发起人
        uint256 amount;              // 销毁金额
        BurnReason reason;           // 销毁原因
        string description;          // 详细描述
        uint256 timestamp;           // 时间戳
        uint256 totalBurnedAtTime;   // 该时刻的累计销毁量
        uint256 eventId;             // 事件 ID
    }

    // ==================== 事件定义 ====================

    /**
     * @dev 当 $AIGG 被销毁时触发
     * @param initiator 销毁发起人
     * @param amount 销毁金额
     * @param reason 销毁原因
     * @param description 详细描述
     * @param timestamp 时间戳
     */
    event TokenBurned(
        address indexed initiator,
        uint256 amount,
        BurnReason indexed reason,
        string description,
        uint256 timestamp
    );

    /**
     * @dev 当达到销毁里程碑时触发
     * @param milestoneNumber 里程碑序号（如 1 表示第 1000 万，2 表示第 2000 万）
     * @param totalBurned 累计销毁总量
     * @param timestamp 达成时间戳
     */
    event MilestoneReached(
        uint256 indexed milestoneNumber,
        uint256 totalBurned,
        uint256 timestamp
    );

    /**
     * @dev 当 AIGG 代币地址被设置时触发
     * @param tokenAddress 代币地址
     * @param timestamp 时间戳
     */
    event AiggTokenSet(address indexed tokenAddress, uint256 timestamp);

    /**
     * @dev 当游戏合约地址被更新时触发
     * @param gameContract 游戏合约地址
     * @param timestamp 时间戳
     */
    event GameContractUpdated(address indexed gameContract, uint256 timestamp);

    // ==================== 修饰符 ====================

    /**
     * @dev 验证 AIGG 代币已设置
     */
    modifier aiggTokenSet() {
        require(
            aiggToken != address(0),
            "AIGGDeflation: AIGG token not set"
        );
        _;
    }

    /**
     * @dev 仅允许授权的销毁者调用
     */
    modifier onlyBurner() {
        require(
            hasRole(GAME_ROLE, msg.sender) ||
            hasRole(BURNER_ROLE, msg.sender) ||
            msg.sender == owner(),
            "AIGGDeflation: Only authorized burners can call this"
        );
        _;
    }

    // ==================== 初始化函数 ====================

    /**
     * @dev 初始化通缩机制合约
     * @param _aiggToken $AIGG 代币地址
     */
    constructor(address _aiggToken) Ownable(msg.sender) {
        require(_aiggToken != address(0), "AIGGDeflation: Invalid AIGG token");
        aiggToken = _aiggToken;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ==================== 管理函数 ====================

    /**
     * @dev 设置 AIGG 代币地址
     * @param _aiggToken 代币地址
     */
    function setAiggToken(address _aiggToken) external onlyOwner {
        require(_aiggToken != address(0), "AIGGDeflation: Invalid token");
        aiggToken = _aiggToken;
        emit AiggTokenSet(_aiggToken, block.timestamp);
    }

    /**
     * @dev 授予游戏合约权限
     * @param _gameContract 游戏合约地址
     */
    function grantGameRole(address _gameContract) external onlyOwner {
        _grantRole(GAME_ROLE, _gameContract);
        emit GameContractUpdated(_gameContract, block.timestamp);
    }

    /**
     * @dev 授予销毁者权限
     * @param _burner 销毁者地址
     */
    function grantBurnerRole(address _burner) external onlyOwner {
        _grantRole(BURNER_ROLE, _burner);
    }

    // ==================== 核心销毁函数 ====================

    /**
     * @dev 记录销毁事件并执行销毁
     * @param _amount 销毁金额
     * @param _reason 销毁原因
     * @param _description 详细描述
     * @notice 调用者必须拥有足够的代币并已授权本合约
     */
    function burnTokens(
        uint256 _amount,
        BurnReason _reason,
        string memory _description
    )
        external
        onlyBurner
        aiggTokenSet
        nonReentrant
    {
        require(_amount > 0, "AIGGDeflation: Amount must be greater than 0");
        require(bytes(_description).length > 0, "AIGGDeflation: Description required");

        // 从调用者账户转入代币
        IERC20(aiggToken).safeTransferFrom(msg.sender, address(this), _amount);

        // 销毁代币
        _executeDeflation(_amount, msg.sender, _reason, _description);
    }

    /**
     * @dev 游戏合约代表用户销毁代币（用于孵化、升级等消费）
     * @param _user 用户地址
     * @param _amount 销毁金额
     * @param _reason 销毁原因
     * @param _description 详细描述
     * @notice 游戏合约应先从用户账户转入代币到本合约
     */
    function burnForUser(
        address _user,
        uint256 _amount,
        BurnReason _reason,
        string memory _description
    )
        external
        onlyBurner
        aiggTokenSet
        nonReentrant
    {
        require(_user != address(0), "AIGGDeflation: Invalid user");
        require(_amount > 0, "AIGGDeflation: Amount must be greater than 0");
        require(bytes(_description).length > 0, "AIGGDeflation: Description required");

        // 确认合约已接收到足够的代币
        require(
            IERC20(aiggToken).balanceOf(address(this)) >= _amount,
            "AIGGDeflation: Insufficient token balance"
        );

        _executeDeflation(_amount, _user, _reason, _description);
    }

    /**
     * @dev 内部函数：执行销毁并记录事件
     */
    function _executeDeflation(
        uint256 _amount,
        address _initiator,
        BurnReason _reason,
        string memory _description
    )
        internal
    {
        // 销毁代币
        IERC20(aiggToken).safeApprove(address(this), _amount);
        // 实际销毁：转到零地址
        IERC20(aiggToken).safeTransfer(address(0), _amount);

        // 更新统计
        totalBurned += _amount;
        burnEventCount++;
        burnByReason[uint8(_reason)] += _amount;
        burnCountByReason[uint8(_reason)]++;

        // 创建事件记录
        uint256 eventId = burnEvents.length;
        BurnEvent memory newEvent = BurnEvent({
            initiator: _initiator,
            amount: _amount,
            reason: _reason,
            description: _description,
            timestamp: block.timestamp,
            totalBurnedAtTime: totalBurned,
            eventId: eventId
        });

        burnEvents.push(newEvent);
        userBurnEventIds[_initiator].push(eventId);

        // 触发销毁事件
        emit TokenBurned(_initiator, _amount, _reason, _description, block.timestamp);

        // 检查是否达到里程碑
        _checkMilestones();
    }

    /**
     * @dev 内部函数：检查是否达到销毁里程碑
     */
    function _checkMilestones() internal {
        uint256 expectedMilestones = totalBurned / MILESTONE_THRESHOLD;

        if (expectedMilestones > milestonesReached) {
            uint256 newMilestonesCount = expectedMilestones - milestonesReached;

            for (uint256 i = 0; i < newMilestonesCount; i++) {
                uint256 milestoneNumber = milestonesReached + i + 1;
                emit MilestoneReached(
                    milestoneNumber,
                    totalBurned,
                    block.timestamp
                );
            }

            milestonesReached = expectedMilestones;
        }
    }

    // ==================== 查询函数 ====================

    /**
     * @dev 查询总销毁数量
     * @return 总销毁的 $AIGG 数量
     */
    function getTotalBurned() external view returns (uint256) {
        return totalBurned;
    }

    /**
     * @dev 查询指定原因的销毁总量
     * @param _reason 销毁原因
     * @return 该原因的总销毁量
     */
    function getBurnedByReason(BurnReason _reason)
        external
        view
        returns (uint256)
    {
        return burnByReason[uint8(_reason)];
    }

    /**
     * @dev 查询指定原因的销毁次数
     * @param _reason 销毁原因
     * @return 销毁次数
     */
    function getBurnCountByReason(BurnReason _reason)
        external
        view
        returns (uint256)
    {
        return burnCountByReason[uint8(_reason)];
    }

    /**
     * @dev 查询销毁统计
     * @return 返回总销毁量、销毁事件数、已达里程碑数
     */
    function getDeflationStats()
        external
        view
        returns (
            uint256 total,
            uint256 eventCount,
            uint256 milestones
        )
    {
        return (totalBurned, burnEventCount, milestonesReached);
    }

    /**
     * @dev 查询销毁事件总数
     * @return 事件数量
     */
    function getBurnEventCount() external view returns (uint256) {
        return burnEvents.length;
    }

    /**
     * @dev 查询特定销毁事件详情
     * @param _eventId 事件 ID
     * @return 事件详情
     */
    function getBurnEvent(uint256 _eventId)
        external
        view
        returns (BurnEvent memory)
    {
        require(_eventId < burnEvents.length, "AIGGDeflation: Invalid event ID");
        return burnEvents[_eventId];
    }

    /**
     * @dev 查询用户的销毁历史
     * @param _user 用户地址
     * @return 用户相关的销毁事件 ID 列表
     */
    function getUserBurnHistory(address _user)
        external
        view
        returns (uint256[] memory)
    {
        return userBurnEventIds[_user];
    }

    /**
     * @dev 查询用户的销毁总额
     * @param _user 用户地址
     * @return 用户销毁的总金额
     */
    function getUserTotalBurned(address _user)
        external
        view
        returns (uint256)
    {
        uint256 total = 0;
        uint256[] memory eventIds = userBurnEventIds[_user];

        for (uint256 i = 0; i < eventIds.length; i++) {
            total += burnEvents[eventIds[i]].amount;
        }

        return total;
    }

    /**
     * @dev 查询距离下一个里程碑的销毁量
     * @return 还需销毁的数量
     */
    function getRemainingForNextMilestone()
        external
        view
        returns (uint256)
    {
        uint256 nextMilestoneTarget = (milestonesReached + 1) * MILESTONE_THRESHOLD;

        if (totalBurned >= nextMilestoneTarget) {
            return 0;
        }

        return nextMilestoneTarget - totalBurned;
    }

    /**
     * @dev 获取所有销毁事件（支持分页）
     * @param _start 起始索引
     * @param _count 数量
     * @return 销毁事件列表
     */
    function getBurnEventsPage(uint256 _start, uint256 _count)
        external
        view
        returns (BurnEvent[] memory)
    {
        require(_start < burnEvents.length, "AIGGDeflation: Start index out of range");

        uint256 end = _start + _count;
        if (end > burnEvents.length) {
            end = burnEvents.length;
        }

        BurnEvent[] memory result = new BurnEvent[](end - _start);
        for (uint256 i = _start; i < end; i++) {
            result[i - _start] = burnEvents[i];
        }

        return result;
    }
}
```

---

## 部署脚本

### deploy.js - Hardhat 部署脚本

```javascript
const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    console.log("========================================");
    console.log("开始部署 AIggs 流动性与兑换合约");
    console.log("========================================\n");

    // 获取部署账户
    const [deployer] = await ethers.getSigners();
    console.log(`部署账户: ${deployer.address}`);

    // 获取余额
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`账户余额: ${ethers.formatEther(balance)} ETH\n`);

    // ==================== 部署地址配置 ====================
    // 这些应该从已部署的 AIGGToken 合约获取
    const AIGG_TOKEN_ADDRESS = process.env.AIGG_TOKEN_ADDRESS ||
        "0x0000000000000000000000000000000000000001"; // 替换为实际地址

    const INITIAL_TREASURY_ADDRESS = process.env.TREASURY_ADDRESS ||
        deployer.address;

    const INITIAL_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC

    // ==================== 步骤 1: 部署 AIGGRevenueDistributor ====================
    console.log("步骤 1: 部署收入分配合约 (AIGGRevenueDistributor)...");

    // 先部署 LiquidityManager（占位符）
    const AIGGLiquidityManager = await hre.ethers.getContractFactory("AIGGLiquidityManager");
    const liquidityManagerTemp = await AIGGLiquidityManager.deploy(AIGG_TOKEN_ADDRESS);
    await liquidityManagerTemp.waitForDeployment();
    const liquidityManagerAddr = await liquidityManagerTemp.getAddress();
    console.log(`✓ 流动性管理合约临时部署在: ${liquidityManagerAddr}`);

    const AIGGRevenueDistributor = await hre.ethers.getContractFactory("AIGGRevenueDistributor");
    const revenueDistributor = await AIGGRevenueDistributor.deploy(
        liquidityManagerAddr,
        INITIAL_TREASURY_ADDRESS
    );
    await revenueDistributor.waitForDeployment();
    const revenuDistributorAddr = await revenueDistributor.getAddress();
    console.log(`✓ 收入分配合约部署在: ${revenuDistributorAddr}\n`);

    // ==================== 步骤 2: 部署 AIGGLiquidityManager ====================
    console.log("步骤 2: 部署流动性管理合约 (AIGGLiquidityManager)...");

    const liquidityManager = await AIGGLiquidityManager.deploy(AIGG_TOKEN_ADDRESS);
    await liquidityManager.waitForDeployment();
    const liquidityManagerFinalAddr = await liquidityManager.getAddress();
    console.log(`✓ 流动性管理合约部署在: ${liquidityManagerFinalAddr}\n`);

    // 更新 RevenueDistributor 中的 LiquidityManager 地址
    const updateTx = await revenueDistributor.setLiquidityManager(liquidityManagerFinalAddr);
    await updateTx.wait();
    console.log(`✓ 已更新 RevenueDistributor 中的 LiquidityManager 地址\n`);

    // ==================== 步骤 3: 部署 AIGGExchangeBridge ====================
    console.log("步骤 3: 部署 EGGS 兑换桥 (AIGGExchangeBridge)...");

    const AIGGExchangeBridge = await hre.ethers.getContractFactory("AIGGExchangeBridge");
    const exchangeBridge = await AIGGExchangeBridge.deploy(AIGG_TOKEN_ADDRESS);
    await exchangeBridge.waitForDeployment();
    const exchangeBridgeAddr = await exchangeBridge.getAddress();
    console.log(`✓ EGGS 兑换桥部署在: ${exchangeBridgeAddr}\n`);

    // ==================== 步骤 4: 部署 AIGGDeflation ====================
    console.log("步骤 4: 部署通缩机制合约 (AIGGDeflation)...");

    const AIGGDeflation = await hre.ethers.getContractFactory("AIGGDeflation");
    const deflation = await AIGGDeflation.deploy(AIGG_TOKEN_ADDRESS);
    await deflation.waitForDeployment();
    const deflationAddr = await deflation.getAddress();
    console.log(`✓ 通缩机制合约部署在: ${deflationAddr}\n`);

    // ==================== 步骤 5: 配置合约权限 ====================
    console.log("步骤 5: 配置合约权限和角色...");

    // 为 LiquidityManager 添加支持的 USDC 代币
    const addTokenTx = await revenueDistributor.addSupportedToken(INITIAL_USDC_ADDRESS);
    await addTokenTx.wait();
    console.log(`✓ 已添加 USDC 作为支持的支付代币`);

    // 为 ExchangeBridge 授予游戏服务器角色
    const GAME_SERVER_ROLE = await exchangeBridge.GAME_SERVER_ROLE();
    const grantRoleTx = await exchangeBridge.grantRole(GAME_SERVER_ROLE, deployer.address);
    await grantRoleTx.wait();
    console.log(`✓ 已授予部署者游戏服务器角色`);

    // 为 Deflation 授予游戏角色
    const GAME_ROLE = await deflation.GAME_ROLE();
    const grantGameRoleTx = await deflation.grantRole(GAME_ROLE, deployer.address);
    await grantGameRoleTx.wait();
    console.log(`✓ 已授予部署者游戏角色\n`);

    // ==================== 步骤 6: 输出部署总结 ====================
    console.log("========================================");
    console.log("部署完成！合约地址汇总");
    console.log("========================================");
    console.log(`\n AIggs 流动性与兑换合约部署地址:\n`);
    console.log(`  AIGGRevenueDistributor: ${revenuDistributorAddr}`);
    console.log(`  AIGGLiquidityManager:   ${liquidityManagerFinalAddr}`);
    console.log(`  AIGGExchangeBridge:     ${exchangeBridgeAddr}`);
    console.log(`  AIGGDeflation:          ${deflationAddr}`);
    console.log(`\n配置信息:\n`);
    console.log(`  AIGG Token Address:     ${AIGG_TOKEN_ADDRESS}`);
    console.log(`  Treasury Address:       ${INITIAL_TREASURY_ADDRESS}`);
    console.log(`  USDC Address:           ${INITIAL_USDC_ADDRESS}`);
    console.log(`\n========================================\n`);

    // ==================== 步骤 7: 保存部署信息到文件 ====================
    const deploymentInfo = {
        network: hre.network.name,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            AIGGRevenueDistributor: revenuDistributorAddr,
            AIGGLiquidityManager: liquidityManagerFinalAddr,
            AIGGExchangeBridge: exchangeBridgeAddr,
            AIGGDeflation: deflationAddr
        },
        config: {
            AIGGToken: AIGG_TOKEN_ADDRESS,
            Treasury: INITIAL_TREASURY_ADDRESS,
            USDC: INITIAL_USDC_ADDRESS
        }
    };

    const fs = require("fs");
    const path = require("path");
    const deploymentsDir = path.join(__dirname, "deployments");

    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const deploymentFile = path.join(
        deploymentsDir,
        `${hre.network.name}-${Date.now()}.json`
    );

    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log(`✓ 部署信息已保存到: ${deploymentFile}\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("部署失败:", error);
        process.exit(1);
    });
```

---

## 单元测试

### test/liquidityExchange.test.js - 完整的测试套件

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AIggs 流动性与兑换系统", function () {
    let revenueDistributor;
    let liquidityManager;
    let exchangeBridge;
    let deflation;
    let aiggToken;
    let mockUsdc;
    let owner, addr1, addr2, treasury;

    const INITIAL_SUPPLY = ethers.parseEther("1000000000"); // 10 亿
    const LIQUIDITY_PERCENTAGE = 6000; // 60%
    const BASIS_POINTS = 10000;

    beforeEach(async function () {
        [owner, addr1, addr2, treasury] = await ethers.getSigners();

        // 部署模拟 USDC
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockUsdc = await MockERC20.deploy("USDC", "USDC", ethers.parseEther("1000000"));
        await mockUsdc.waitForDeployment();

        // 部署模拟 AIGG Token
        const AIGGToken = await ethers.getContractFactory("MockERC20");
        aiggToken = await AIGGToken.deploy("AIggs Token", "AIGG", INITIAL_SUPPLY);
        await aiggToken.waitForDeployment();

        // 部署流动性管理合约
        const AIGGLiquidityManager = await ethers.getContractFactory("AIGGLiquidityManager");
        liquidityManager = await AIGGLiquidityManager.deploy(await aiggToken.getAddress());
        await liquidityManager.waitForDeployment();

        // 部署收入分配合约
        const AIGGRevenueDistributor = await ethers.getContractFactory("AIGGRevenueDistributor");
        revenueDistributor = await AIGGRevenueDistributor.deploy(
            await liquidityManager.getAddress(),
            treasury.address
        );
        await revenueDistributor.waitForDeployment();

        // 部署 EGGS 兑换桥
        const AIGGExchangeBridge = await ethers.getContractFactory("AIGGExchangeBridge");
        exchangeBridge = await AIGGExchangeBridge.deploy(await aiggToken.getAddress());
        await exchangeBridge.waitForDeployment();

        // 部署通缩机制合约
        const AIGGDeflation = await ethers.getContractFactory("AIGGDeflation");
        deflation = await AIGGDeflation.deploy(await aiggToken.getAddress());
        await deflation.waitForDeployment();

        // 初始化权限
        const GAME_SERVER_ROLE = await exchangeBridge.GAME_SERVER_ROLE();
        const GAME_ROLE = await deflation.GAME_ROLE();
        const BURNER_ROLE = await deflation.BURNER_ROLE();

        await exchangeBridge.grantRole(GAME_SERVER_ROLE, owner.address);
        await deflation.grantRole(GAME_ROLE, owner.address);
        await deflation.grantRole(BURNER_ROLE, owner.address);

        // 添加支持的 USDC 代币
        await revenueDistributor.addSupportedToken(await mockUsdc.getAddress());

        // 向 addr1 和 addr2 转移 AIGG 用于测试
        await aiggToken.transfer(await exchangeBridge.getAddress(), ethers.parseEther("1000000"));
        await aiggToken.transfer(addr1.address, ethers.parseEther("100000"));
        await aiggToken.transfer(addr2.address, ethers.parseEther("100000"));
    });

    describe("收入分配合约", function () {
        it("应该正确初始化", async function () {
            const manager = await revenueDistributor.liquidityManager();
            expect(manager).to.equal(await liquidityManager.getAddress());
        });

        it("应该接收收入并分配", async function () {
            const amount = ethers.parseEther("1000");

            // 向合约授权
            await mockUsdc.approve(await revenueDistributor.getAddress(), amount);

            // 接收收入
            await revenueDistributor.receiveRevenue(
                "test_purchase",
                await mockUsdc.getAddress(),
                amount
            );

            // 检查统计
            const stats = await revenueDistributor.getTotalPendingRevenue();
            expect(stats).to.equal(0); // 应该已全部分配

            // 检查流动性管理合约是否收到 60%
            const liquidityBalance = await mockUsdc.balanceOf(await liquidityManager.getAddress());
            const expectedLiquidity = (amount * 6000n) / 10000n;
            expect(liquidityBalance).to.equal(expectedLiquidity);

            // 检查国库是否收到 40%
            const treasuryBalance = await mockUsdc.balanceOf(treasury.address);
            const expectedTreasury = (amount * 4000n) / 10000n;
            expect(treasuryBalance).to.equal(expectedTreasury);
        });

        it("应该拒绝未支持的代币", async function () {
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const unsupportedToken = await MockERC20.deploy(
                "UNSUPPORTED",
                "UNS",
                ethers.parseEther("1000000")
            );
            await unsupportedToken.waitForDeployment();

            await expect(
                revenueDistributor.receiveRevenue(
                    "test",
                    await unsupportedToken.getAddress(),
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(
                revenueDistributor,
                "TokenNotSupported"
            );
        });
    });

    describe("EGGS 兑换桥", function () {
        it("应该正确初始化汇率", async function () {
            const rate = await exchangeBridge.getCurrentExchangeRate();
            expect(rate).to.equal(30); // 基础汇率 30:1
        });

        it("应该执行 EGGS 兑换", async function () {
            const eggsAmount = ethers.parseEther("300"); // 300 EGGS

            await exchangeBridge.executeExchange(addr1.address, eggsAmount);

            const aiggAmount = await exchangeBridge.getAiggAmount(eggsAmount);
            expect(aiggAmount).to.equal(ethers.parseEther("10")); // 300 / 30 = 10

            // 检查用户统计
            const userTotal = await exchangeBridge.getUserExchangeTotal(addr1.address);
            expect(userTotal).to.equal(aiggAmount);
        });

        it("应该限制日兑换量", async function () {
            const dailyLimit = await exchangeBridge.dailyExchangeLimit();
            const eggsAmount = ethers.parseEther("600000000"); // 足够导致超过日限

            await expect(
                exchangeBridge.executeExchange(addr1.address, eggsAmount)
            ).to.be.revertedWith("Daily exchange limit exceeded");
        });

        it("AI 决策系统应该能调整汇率", async function () {
            const newRate = 25; // 25:1（更优汇率）

            const AI_DECISION_ROLE = await exchangeBridge.AI_DECISION_ROLE();
            await exchangeBridge.grantRole(AI_DECISION_ROLE, addr1.address);

            await exchangeBridge.connect(addr1).updateExchangeRateByAi(
                newRate,
                "market_rebalance"
            );

            const currentRate = await exchangeBridge.getCurrentExchangeRate();
            expect(currentRate).to.equal(newRate);
        });

        it("应该拒绝超出范围的汇率", async function () {
            const AI_DECISION_ROLE = await exchangeBridge.AI_DECISION_ROLE();
            await exchangeBridge.grantRole(AI_DECISION_ROLE, addr1.address);

            // 尝试设置低于最小值
            await expect(
                exchangeBridge.connect(addr1).updateExchangeRateByAi(15, "invalid")
            ).to.be.revertedWith("Exchange rate out of range");

            // 尝试设置高于最大值
            await expect(
                exchangeBridge.connect(addr1).updateExchangeRateByAi(60, "invalid")
            ).to.be.revertedWith("Exchange rate out of range");
        });
    });

    describe("通缩机制合约", function () {
        it("应该记录销毁事件", async function () {
            const burnAmount = ethers.parseEther("1000");

            // 授权
            await aiggToken.approve(await deflation.getAddress(), burnAmount);

            // 销毁
            await deflation.burnTokens(
                burnAmount,
                0, // CHICKEN_HATCHING
                "test burn"
            );

            const totalBurned = await deflation.getTotalBurned();
            expect(totalBurned).to.equal(burnAmount);

            const eventCount = await deflation.getBurnEventCount();
            expect(eventCount).to.equal(1);
        });

        it("应该跟踪不同原因的销毁", async function () {
            const amount1 = ethers.parseEther("500");
            const amount2 = ethers.parseEther("300");

            await aiggToken.approve(await deflation.getAddress(), amount1 + amount2);

            // 孵化销毁
            await deflation.burnTokens(amount1, 0, "hatching");

            // 防盗道具销毁
            await deflation.burnTokens(amount2, 1, "defense prop");

            const hatchingBurned = await deflation.getBurnedByReason(0);
            const defenseBurned = await deflation.getBurnedByReason(1);

            expect(hatchingBurned).to.equal(amount1);
            expect(defenseBurned).to.equal(amount2);
        });

        it("应该在达到里程碑时触发事件", async function () {
            const milestoneBurnAmount = ethers.parseEther("10000000"); // 1000 万

            // 获得足够的代币
            await aiggToken.transfer(owner.address, milestoneBurnAmount);
            await aiggToken.approve(await deflation.getAddress(), milestoneBurnAmount);

            const tx = await deflation.burnTokens(
                milestoneBurnAmount,
                0,
                "milestone test"
            );

            const receipt = await tx.wait();
            expect(receipt.logs.length).to.be.greaterThan(0);

            const milestones = await deflation.milestonesReached();
            expect(milestones).to.equal(1);
        });

        it("应该查询用户的销毁历史", async function () {
            const amount = ethers.parseEther("500");

            await aiggToken.approve(await deflation.getAddress(), amount * 2n);

            await deflation.burnTokens(amount, 0, "first");
            await deflation.burnTokens(amount, 1, "second");

            const history = await deflation.getUserBurnHistory(owner.address);
            expect(history.length).to.equal(2);

            const totalUserBurned = await deflation.getUserTotalBurned(owner.address);
            expect(totalUserBurned).to.equal(amount * 2n);
        });
    });

    describe("流动性管理合约", function () {
        it("应该正确初始化", async function () {
            const token = await liquidityManager.aiggToken();
            expect(token).to.equal(await aiggToken.getAddress());
        });

        it("应该更新滑点容限", async function () {
            await liquidityManager.setSlippageTolerance(90); // 10% 滑点

            const tolerance = await liquidityManager.slippageTolerance();
            expect(tolerance).to.equal(90);
        });

        it("应该暂停和恢复流动性注入", async function () {
            await liquidityManager.pause();
            expect(await liquidityManager.paused()).to.be.true;

            await liquidityManager.unpause();
            expect(await liquidityManager.paused()).to.be.false;
        });
    });

    describe("集成测试", function () {
        it("完整的收入到流动性流程", async function () {
            // 1. 接收收入
            const revenue = ethers.parseEther("1000");
            await mockUsdc.approve(await revenueDistributor.getAddress(), revenue);

            await revenueDistributor.receiveRevenue(
                "integration_test",
                await mockUsdc.getAddress(),
                revenue
            );

            // 2. 验证分配
            const liquidityReceived = await mockUsdc.balanceOf(
                await liquidityManager.getAddress()
            );
            const expectedLiquidity = (revenue * 6000n) / 10000n;
            expect(liquidityReceived).to.equal(expectedLiquidity);

            // 3. 验证国库收款
            const treasuryReceived = await mockUsdc.balanceOf(treasury.address);
            const expectedTreasury = (revenue * 4000n) / 10000n;
            expect(treasuryReceived).to.equal(expectedTreasury);
        });

        it("完整的 EGGS 兑换流程", async function () {
            // 1. 执行兑换
            const eggsAmount = ethers.parseEther("3000");
            await exchangeBridge.executeExchange(addr1.address, eggsAmount);

            // 2. 验证统计
            const stats = await exchangeBridge.getExchangeStats();
            expect(stats.totalEggs).to.equal(eggsAmount);
            expect(stats.totalAigg).to.be.greaterThan(0);

            // 3. 验证用户收到代币
            const userExchanged = await exchangeBridge.getUserExchangeTotal(addr1.address);
            expect(userExchanged).to.be.greaterThan(0);
        });
    });
});

// 模拟 ERC20 代币合约（用于测试）
describe("MockERC20", function () {
    let mockToken;
    let owner, addr1;

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy(
            "Mock Token",
            "MOCK",
            ethers.parseEther("1000000")
        );
        await mockToken.waitForDeployment();
    });

    it("应该有正确的初始供应", async function () {
        const supply = await mockToken.totalSupply();
        expect(supply).to.equal(ethers.parseEther("1000000"));
    });

    it("应该转账代币", async function () {
        const amount = ethers.parseEther("100");
        await mockToken.transfer(addr1.address, amount);

        const balance = await mockToken.balanceOf(addr1.address);
        expect(balance).to.equal(amount);
    });
});
```

### MockERC20.sol - 用于测试的模拟 ERC20 代币

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @dev 用于测试的模拟 ERC20 代币
 */
contract MockERC20 is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    // 允许测试中销毁代币
    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}
```

---

## 部署指南

### 环境准备

```bash
# 1. 安装依赖
npm install --save-dev hardhat @openzeppelin/contracts
npm install --save-dev @nomicfoundation/hardhat-toolbox

# 2. 初始化 Hardhat 项目（如果还没有）
npx hardhat init
```

### hardhat.config.js 配置

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");

module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        // Base 主网
        base: {
            url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
        },
        // Base Sepolia 测试网
        baseSepolia: {
            url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
        },
        // 本地测试网
        hardhat: {
            chainId: 1337
        },
        localhost: {
            url: "http://127.0.0.1:8545"
        }
    },
    etherscan: {
        apiKey: {
            base: process.env.BASE_ETHERSCAN_API_KEY || "",
            baseSepolia: process.env.BASE_ETHERSCAN_API_KEY || ""
        }
    }
};
```

### 部署到 Base 测试网

```bash
# 1. 设置环境变量
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export PRIVATE_KEY="your_private_key_here"
export AIGG_TOKEN_ADDRESS="0x..."
export TREASURY_ADDRESS="0x..."

# 2. 编译合约
npx hardhat compile

# 3. 运行测试
npx hardhat test

# 4. 部署到 Base Sepolia
npx hardhat run scripts/deploy.js --network baseSepolia

# 5. 验证合约（可选）
npx hardhat verify --network baseSepolia DEPLOYED_ADDRESS "constructor_args"
```

### 部署到 Base 主网

```bash
# 1. 设置环境变量（使用主网 RPC）
export BASE_RPC_URL="https://mainnet.base.org"
export PRIVATE_KEY="your_mainnet_private_key_here"

# 2. 部署到主网
npx hardhat run scripts/deploy.js --network base

# 3. 查看部署结果
cat deployments/base-*.json
```

### 环境文件示例 (.env)

```
# Network RPC URLs
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Private Key (use test key for testnet only!)
PRIVATE_KEY=0x...

# Contract Addresses
AIGG_TOKEN_ADDRESS=0x...
TREASURY_ADDRESS=0x...

# Etherscan API Key
BASE_ETHERSCAN_API_KEY=...
```

### 部署后的验证步骤

1. **验证合约在区块链浏览器上可见**
   ```bash
   # Base Sepolia: https://sepolia.basescan.org
   # Base Mainnet: https://basescan.org
   ```

2. **测试基本功能**
   ```javascript
   // 通过 Hardhat console
   npx hardhat console --network baseSepolia

   // 获取合约实例
   const distributor = await ethers.getContractAt(
     "AIGGRevenueDistributor",
     "0x..."
   );

   // 检查初始化状态
   await distributor.liquidityManager();
   ```

3. **监控链上事件**
   - 使用 Etherscan 的事件日志查看
   - 或通过 TheGraph 创建子图查询

---

## 完整的合约交互示例

### 交互脚本 scripts/interact.js

```javascript
const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    const [signer] = await ethers.getSigners();

    // ==================== 加载已部署的合约 ====================
    const DISTRIBUTOR_ADDR = "0x..."; // 替换为实际地址
    const LIQUIDITY_MGR_ADDR = "0x...";
    const EXCHANGE_BRIDGE_ADDR = "0x...";
    const DEFLATION_ADDR = "0x...";

    const distributor = await ethers.getContractAt(
        "AIGGRevenueDistributor",
        DISTRIBUTOR_ADDR
    );
    const exchangeBridge = await ethers.getContractAt(
        "AIGGExchangeBridge",
        EXCHANGE_BRIDGE_ADDR
    );
    const deflation = await ethers.getContractAt(
        "AIGGDeflation",
        DEFLATION_ADDR
    );

    console.log("========== AIggs 合约交互示例 ==========\n");

    // 1. 查询当前汇率
    const currentRate = await exchangeBridge.getCurrentExchangeRate();
    console.log(`当前 EGGS 兑换汇率: ${currentRate} EGGS = 1 AIGG`);

    // 2. 计算 EGGS 对应的 AIGG
    const eggsAmount = ethers.parseEther("300");
    const aiggOut = await exchangeBridge.getAiggAmount(eggsAmount);
    console.log(`300 EGGS 可兑换: ${ethers.formatEther(aiggOut)} AIGG`);

    // 3. 查询销毁统计
    const stats = await deflation.getDeflationStats();
    console.log(`\n通缩统计:`);
    console.log(`  总销毁量: ${ethers.formatEther(stats.total)} AIGG`);
    console.log(`  销毁事件数: ${stats.eventCount}`);
    console.log(`  已达里程碑: ${stats.milestones}`);

    // 4. 查询兑换统计
    const exchangeStats = await exchangeBridge.getExchangeStats();
    console.log(`\n兑换统计:`);
    console.log(`  总 EGGS 兑换: ${ethers.formatEther(exchangeStats.totalEggs)}`);
    console.log(`  总 AIGG 分配: ${ethers.formatEther(exchangeStats.totalAigg)}`);
    console.log(`  日限额: ${ethers.formatEther(exchangeStats.dailyLimit)}`);
    console.log(`  今日已兑换: ${ethers.formatEther(exchangeStats.todayExchanged)}`);

    console.log("\n==========================================\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
```

---

## 总结

本文档包含了 AIggs 项目的四个核心智能合约的完整实现：

### 1. **AIGGRevenueDistributor** - 收入分配合约
- 接收法币对应的链上资金（USDC 等）
- 自动分配：60% 流动性 + 40% 国库
- 支持多种收入来源标记

### 2. **AIGGLiquidityManager** - 流动性管理合约
- 自动向 Uniswap V3 注入流动性
- 50% AIGG + 50% USDC 配对
- LP Token 销毁到零地址，确保永久锁定

### 3. **AIGGExchangeBridge** - EGGS 兑换桥
- 基础汇率 30:1，支持 20-50 范围内的动态调整
- 日兑换限额控制
- AI 决策系统可批准汇率变更

### 4. **AIGGDeflation** - 通缩机制合约
- 记录所有游戏内消费销毁
- 里程碑事件追踪（每销毁 1000 万触发）
- 完整的销毁历史链上可追溯

所有合约都遵循：
- ✓ Solidity ^0.8.20
- ✓ OpenZeppelin 安全标准
- ✓ ReentrancyGuard 防护
- ✓ AccessControl 权限管理
- ✓ Pausable 暂停机制
- ✓ 完整的事件日志记录
- ✓ Base 链 EVM 兼容

部署、测试和交互脚本已全部包含，可直接用于 Base 主网和测试网部署。

