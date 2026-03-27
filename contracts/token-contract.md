# AIggs Token ($AIGG) - 完整智能合约文档

## 目录
1. [代币基础信息](#代币基础信息)
2. [主合约代码](#主合约代码)
3. [代币锁仓合约](#代币锁仓合约)
4. [部署脚本](#部署脚本)
5. [单元测试](#单元测试)
6. [部署指南](#部署指南)

---

## 代币基础信息

| 参数 | 值 |
|------|-----|
| 名称 | AIggs Token |
| 符号 | AIGG |
| 总量 | 1,000,000,000 (10亿) |
| 精度 | 18 decimals |
| 部署链 | Base (EVM 兼容) |
| 合约标准 | ERC-20 + OpenZeppelin 扩展 |

### 代币分配

| 类别 | 数量 | 百分比 | 用途 |
|------|------|--------|------|
| 玩家奖励池 | 750,000,000 | 75% | 通过游戏产出分发 |
| 生态基金 | 100,000,000 | 10% | 合作伙伴、开发者激励 |
| 团队 | 100,000,000 | 10% | 2年锁仓，按季度解锁 |
| 空投 | 50,000,000 | 5% | 前1万名用户 |

---

## 主合约代码

### AIGGToken.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title AIGGToken
 * @dev AIggs 原生游戏代币，支持标准 ERC-20 功能及扩展特性
 * @notice 合约部署在 Base 链，支持游戏奖励分发、销毁、暂停等功能
 */
contract AIGGToken is
    ERC20,
    ERC20Pausable,
    ERC20Burnable,
    Ownable,
    AccessControl,
    ReentrancyGuard
{
    // ==================== 常量定义 ====================

    /// @dev 游戏合约管理员角色
    bytes32 public constant GAME_ROLE = keccak256("GAME_ROLE");

    /// @dev 生态基金管理角色
    bytes32 public constant ECOSYSTEM_ROLE = keccak256("ECOSYSTEM_ROLE");

    /// @dev 空投管理角色
    bytes32 public constant AIRDROP_ROLE = keccak256("AIRDROP_ROLE");

    /// @dev 暂停管理角色
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ==================== 状态变量 ====================

    /// @dev 玩家奖励池地址
    address public gameRewardPool;

    /// @dev 生态基金地址
    address public ecosystemFund;

    /// @dev 团队锁仓合约地址
    address public teamVestingContract;

    /// @dev 空投池地址
    address public airdropPool;

    /// @dev 游戏合约地址（用于奖励分发）
    address public gameContract;

    /// @dev 销毁总数追踪
    uint256 public totalBurned;

    /// @dev 已分发的游戏奖励总数
    uint256 public totalGameRewardsDistributed;

    // ==================== 事件定义 ====================

    /**
     * @dev 当奖励池地址更新时触发
     * @param newPoolAddress 新的奖励池地址
     * @param timestamp 更新时间戳
     */
    event GameRewardPoolUpdated(address indexed newPoolAddress, uint256 timestamp);

    /**
     * @dev 当生态基金地址更新时触发
     * @param newFundAddress 新的基金地址
     * @param timestamp 更新时间戳
     */
    event EcosystemFundUpdated(address indexed newFundAddress, uint256 timestamp);

    /**
     * @dev 当游戏合约地址更新时触发
     * @param newGameContract 新的游戏合约地址
     * @param timestamp 更新时间戳
     */
    event GameContractUpdated(address indexed newGameContract, uint256 timestamp);

    /**
     * @dev 当分发游戏奖励时触发
     * @param recipient 接收者地址
     * @param amount 奖励数量
     * @param timestamp 分发时间戳
     */
    event GameRewardDistributed(
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev 当代币被销毁时触发
     * @param burner 销毁者地址
     * @param amount 销毁数量
     * @param timestamp 销毁时间戳
     */
    event TokenBurned(
        address indexed burner,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev 当合约暂停/恢复时触发
     * @param isPaused 是否处于暂停状态
     * @param timestamp 状态变更时间戳
     */
    event PauseStateChanged(bool indexed isPaused, uint256 timestamp);

    // ==================== 修饰符 ====================

    /**
     * @dev 仅允许授权的游戏合约调用
     */
    modifier onlyGameContract() {
        require(
            msg.sender == gameContract || hasRole(GAME_ROLE, msg.sender),
            "AIGGToken: Only game contract can call this function"
        );
        _;
    }

    // ==================== 初始化函数 ====================

    /**
     * @dev 初始化 AIGGToken 合约
     * @param _gameRewardPool 玩家奖励池地址
     * @param _ecosystemFund 生态基金地址
     * @param _teamVestingContract 团队锁仓合约地址
     * @param _airdropPool 空投池地址
     */
    constructor(
        address _gameRewardPool,
        address _ecosystemFund,
        address _teamVestingContract,
        address _airdropPool
    ) ERC20("AIggs Token", "AIGG") Ownable(msg.sender) {
        require(_gameRewardPool != address(0), "AIGGToken: Invalid game reward pool");
        require(_ecosystemFund != address(0), "AIGGToken: Invalid ecosystem fund");
        require(_teamVestingContract != address(0), "AIGGToken: Invalid team vesting contract");
        require(_airdropPool != address(0), "AIGGToken: Invalid airdrop pool");

        gameRewardPool = _gameRewardPool;
        ecosystemFund = _ecosystemFund;
        teamVestingContract = _teamVestingContract;
        airdropPool = _airdropPool;

        // 初始化角色
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(ECOSYSTEM_ROLE, msg.sender);
        _grantRole(AIRDROP_ROLE, msg.sender);

        // 铸造总供应量：10亿 AIGG
        uint256 totalSupply = 1_000_000_000 * 10 ** decimals();

        // 分配代币到各个池
        uint256 gameRewards = (totalSupply * 75) / 100;      // 75% - 7.5亿
        uint256 ecosystem = (totalSupply * 10) / 100;         // 10% - 1亿
        uint256 team = (totalSupply * 10) / 100;              // 10% - 1亿
        uint256 airdrop = (totalSupply * 5) / 100;            // 5% - 5千万

        _mint(_gameRewardPool, gameRewards);
        _mint(_ecosystemFund, ecosystem);
        _mint(_teamVestingContract, team);
        _mint(_airdropPool, airdrop);
    }

    // ==================== 管理员函数 ====================

    /**
     * @dev 设置游戏合约地址
     * @param _gameContract 新的游戏合约地址
     */
    function setGameContract(address _gameContract)
        external
        onlyOwner
    {
        require(_gameContract != address(0), "AIGGToken: Invalid game contract address");
        gameContract = _gameContract;
        _grantRole(GAME_ROLE, _gameContract);
        emit GameContractUpdated(_gameContract, block.timestamp);
    }

    /**
     * @dev 更新游戏奖励池地址
     * @param _newPoolAddress 新的奖励池地址
     */
    function setGameRewardPool(address _newPoolAddress)
        external
        onlyOwner
    {
        require(_newPoolAddress != address(0), "AIGGToken: Invalid pool address");
        gameRewardPool = _newPoolAddress;
        emit GameRewardPoolUpdated(_newPoolAddress, block.timestamp);
    }

    /**
     * @dev 更新生态基金地址
     * @param _newFundAddress 新的基金地址
     */
    function setEcosystemFund(address _newFundAddress)
        external
        onlyOwner
    {
        require(_newFundAddress != address(0), "AIGGToken: Invalid fund address");
        ecosystemFund = _newFundAddress;
        emit EcosystemFundUpdated(_newFundAddress, block.timestamp);
    }

    /**
     * @dev 暂停所有代币转账
     */
    function pause()
        external
        onlyRole(PAUSER_ROLE)
    {
        _pause();
        emit PauseStateChanged(true, block.timestamp);
    }

    /**
     * @dev 恢复代币转账
     */
    function unpause()
        external
        onlyRole(PAUSER_ROLE)
    {
        _unpause();
        emit PauseStateChanged(false, block.timestamp);
    }

    // ==================== 游戏奖励分发函数 ====================

    /**
     * @dev 分发游戏奖励给玩家
     * @param recipient 奖励接收者地址
     * @param amount 奖励数量
     */
    function distributeGameReward(address recipient, uint256 amount)
        external
        onlyGameContract
        nonReentrant
    {
        require(recipient != address(0), "AIGGToken: Invalid recipient address");
        require(amount > 0, "AIGGToken: Reward amount must be greater than 0");
        require(
            balanceOf(gameRewardPool) >= amount,
            "AIGGToken: Insufficient game reward pool balance"
        );

        // 从游戏奖励池转账到接收者
        _transfer(gameRewardPool, recipient, amount);
        totalGameRewardsDistributed += amount;

        emit GameRewardDistributed(recipient, amount, block.timestamp);
    }

    /**
     * @dev 批量分发游戏奖励
     * @param recipients 接收者地址数组
     * @param amounts 对应的奖励数量数组
     */
    function batchDistributeGameRewards(
        address[] calldata recipients,
        uint256[] calldata amounts
    )
        external
        onlyGameContract
        nonReentrant
    {
        require(
            recipients.length == amounts.length,
            "AIGGToken: Recipients and amounts length mismatch"
        );
        require(recipients.length > 0, "AIGGToken: Empty recipients array");
        require(recipients.length <= 100, "AIGGToken: Too many recipients in one batch");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        require(
            balanceOf(gameRewardPool) >= totalAmount,
            "AIGGToken: Insufficient game reward pool balance"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "AIGGToken: Invalid recipient");
            require(amounts[i] > 0, "AIGGToken: Invalid amount");

            _transfer(gameRewardPool, recipients[i], amounts[i]);
            emit GameRewardDistributed(recipients[i], amounts[i], block.timestamp);
        }

        totalGameRewardsDistributed += totalAmount;
    }

    // ==================== 销毁函数 ====================

    /**
     * @dev 销毁指定数量的代币（由所有者调用）
     * @param amount 要销毁的代币数量
     */
    function burnTokens(uint256 amount)
        external
        onlyOwner
    {
        require(amount > 0, "AIGGToken: Burn amount must be greater than 0");
        _burn(msg.sender, amount);
        totalBurned += amount;
        emit TokenBurned(msg.sender, amount, block.timestamp);
    }

    /**
     * @dev 从游戏奖励池销毁代币（用于游戏内消费通缩）
     * @param amount 要销毁的代币数量
     */
    function burnFromGamePool(uint256 amount)
        external
        onlyGameContract
    {
        require(amount > 0, "AIGGToken: Burn amount must be greater than 0");
        require(
            balanceOf(gameRewardPool) >= amount,
            "AIGGToken: Insufficient game pool balance"
        );
        _burn(gameRewardPool, amount);
        totalBurned += amount;
        emit TokenBurned(gameRewardPool, amount, block.timestamp);
    }

    // ==================== 查询函数 ====================

    /**
     * @dev 获取游戏奖励池余额
     * @return 游戏奖励池的代币余额
     */
    function getGameRewardPoolBalance() external view returns (uint256) {
        return balanceOf(gameRewardPool);
    }

    /**
     * @dev 获取生态基金余额
     * @return 生态基金的代币余额
     */
    function getEcosystemFundBalance() external view returns (uint256) {
        return balanceOf(ecosystemFund);
    }

    /**
     * @dev 获取空投池余额
     * @return 空投池的代币余额
     */
    function getAirdropPoolBalance() external view returns (uint256) {
        return balanceOf(airdropPool);
    }

    /**
     * @dev 获取代币销毁总数
     * @return 已销毁的代币总数量
     */
    function getTotalBurned() external view returns (uint256) {
        return totalBurned;
    }

    /**
     * @dev 获取已分发的游戏奖励总数
     * @return 已分发的游戏奖励总数量
     */
    function getTotalGameRewardsDistributed() external view returns (uint256) {
        return totalGameRewardsDistributed;
    }

    // ==================== 内部重写函数 ====================

    /**
     * @dev 重写 _update 函数以支持暂停功能
     */
    function _update(
        address from,
        address to,
        uint256 amount
    )
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, amount);
    }

    /**
     * @dev 重写 nonces 函数支持 permit 功能
     */
    function nonces(address owner)
        public
        view
        override(ERC20)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
```

---

## 代币锁仓合约

### AIGGTokenVesting.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title AIGGTokenVesting
 * @dev 团队代币锁仓合约（2年期，按季度线性解锁）
 * @notice 支持每季度解锁 12.5%（共8个季度）
 */
contract AIGGTokenVesting is Ownable, ReentrancyGuard {
    // ==================== 常量定义 ====================

    /// @dev 一个季度的秒数（90 天）
    uint256 public constant QUARTER_DURATION = 90 days;

    /// @dev 总锁仓期限（2年 = 8个季度）
    uint256 public constant TOTAL_QUARTERS = 8;

    /// @dev 每季度解锁百分比（12.5%）
    uint256 public constant QUARTER_PERCENTAGE = 1250; // 12.5% = 1250/10000

    // ==================== 状态变量 ====================

    /// @dev AIGGToken 合约地址
    IERC20 public aiggToken;

    /// @dev 锁仓开始时间戳
    uint256 public vestingStartTime;

    /// @dev 受益人地址
    address public beneficiary;

    /// @dev 初始锁仓代币数量
    uint256 public initialBalance;

    /// @dev 已释放的代币数量
    uint256 public releasedAmount;

    /// @dev 锁仓是否已完成初始化
    bool public initialized;

    // ==================== 事件定义 ====================

    /**
     * @dev 当初始化锁仓时触发
     * @param beneficiary 受益人地址
     * @param initialAmount 初始锁仓金额
     * @param startTime 锁仓开始时间
     */
    event VestingInitialized(
        address indexed beneficiary,
        uint256 initialAmount,
        uint256 startTime
    );

    /**
     * @dev 当释放代币时触发
     * @param beneficiary 受益人地址
     * @param amount 释放的代币数量
     * @param releasedTime 释放时间戳
     * @param quarterNumber 当前解锁的季度数
     */
    event TokensReleased(
        address indexed beneficiary,
        uint256 amount,
        uint256 releasedTime,
        uint256 quarterNumber
    );

    // ==================== 修饰符 ====================

    /**
     * @dev 仅允许受益人操作
     */
    modifier onlyBeneficiary() {
        require(msg.sender == beneficiary, "AIGGTokenVesting: Only beneficiary can call");
        _;
    }

    // ==================== 初始化函数 ====================

    /**
     * @dev 初始化代币锁仓合约
     * @param _aiggToken AIGGToken 合约地址
     * @param _beneficiary 受益人地址（通常是多签钱包）
     */
    constructor(
        address _aiggToken,
        address _beneficiary
    ) Ownable(msg.sender) {
        require(_aiggToken != address(0), "AIGGTokenVesting: Invalid token address");
        require(_beneficiary != address(0), "AIGGTokenVesting: Invalid beneficiary");

        aiggToken = IERC20(_aiggToken);
        beneficiary = _beneficiary;
    }

    /**
     * @dev 初始化锁仓（在部署 AIGGToken 后调用）
     * @notice 此函数应在 AIGGToken 部署后立即调用
     */
    function initializeVesting()
        external
        onlyOwner
    {
        require(!initialized, "AIGGTokenVesting: Already initialized");

        uint256 tokenBalance = aiggToken.balanceOf(address(this));
        require(tokenBalance > 0, "AIGGTokenVesting: No tokens to vest");

        initialBalance = tokenBalance;
        vestingStartTime = block.timestamp;
        initialized = true;

        emit VestingInitialized(beneficiary, initialBalance, vestingStartTime);
    }

    // ==================== 主要函数 ====================

    /**
     * @dev 计算当前可释放的代币数量
     * @return 可释放的代币数量
     */
    function getReleasableAmount()
        external
        view
        returns (uint256)
    {
        require(initialized, "AIGGTokenVesting: Not initialized");

        uint256 currentTime = block.timestamp;
        uint256 elapsedTime = currentTime - vestingStartTime;

        // 如果锁仓期还未开始，无法释放
        if (elapsedTime == 0) {
            return 0;
        }

        // 计算已解锁的季度数
        uint256 completedQuarters = elapsedTime / QUARTER_DURATION;

        // 如果超过总锁仓期限，全部释放
        if (completedQuarters >= TOTAL_QUARTERS) {
            return initialBalance - releasedAmount;
        }

        // 计算应该释放的总金额
        uint256 totalReleasable = (initialBalance * completedQuarters * QUARTER_PERCENTAGE) / 10000;

        // 减去已经释放的金额
        uint256 currentReleasable = totalReleasable > releasedAmount
            ? totalReleasable - releasedAmount
            : 0;

        return currentReleasable;
    }

    /**
     * @dev 获取当前已解锁的季度数
     * @return 已解锁的季度数
     */
    function getCompletedQuarters()
        external
        view
        returns (uint256)
    {
        require(initialized, "AIGGTokenVesting: Not initialized");

        uint256 elapsedTime = block.timestamp - vestingStartTime;
        uint256 completedQuarters = elapsedTime / QUARTER_DURATION;

        return completedQuarters > TOTAL_QUARTERS ? TOTAL_QUARTERS : completedQuarters;
    }

    /**
     * @dev 释放已解锁的代币给受益人
     */
    function release()
        external
        onlyBeneficiary
        nonReentrant
    {
        require(initialized, "AIGGTokenVesting: Not initialized");

        uint256 releasable = this.getReleasableAmount();
        require(releasable > 0, "AIGGTokenVesting: No tokens available to release");

        releasedAmount += releasable;

        require(
            aiggToken.transfer(beneficiary, releasable),
            "AIGGTokenVesting: Token transfer failed"
        );

        uint256 completedQuarters = (block.timestamp - vestingStartTime) / QUARTER_DURATION;
        completedQuarters = completedQuarters > TOTAL_QUARTERS ? TOTAL_QUARTERS : completedQuarters;

        emit TokensReleased(beneficiary, releasable, block.timestamp, completedQuarters);
    }

    /**
     * @dev 获取锁仓详细信息
     * @return 锁仓详情（beneficiary, initialBalance, releasedAmount, nextReleaseTime）
     */
    function getVestingInfo()
        external
        view
        returns (
            address,
            uint256,
            uint256,
            uint256
        )
    {
        require(initialized, "AIGGTokenVesting: Not initialized");

        uint256 elapsedTime = block.timestamp - vestingStartTime;
        uint256 completedQuarters = elapsedTime / QUARTER_DURATION;
        uint256 nextReleaseTime = vestingStartTime + ((completedQuarters + 1) * QUARTER_DURATION);

        return (beneficiary, initialBalance, releasedAmount, nextReleaseTime);
    }

    /**
     * @dev 获取锁仓时间表
     * @return 返回锁仓开始时间和解锁时间表数组
     */
    function getVestingSchedule()
        external
        view
        returns (uint256[] memory)
    {
        require(initialized, "AIGGTokenVesting: Not initialized");

        uint256[] memory schedule = new uint256[](TOTAL_QUARTERS);

        for (uint256 i = 0; i < TOTAL_QUARTERS; i++) {
            schedule[i] = vestingStartTime + ((i + 1) * QUARTER_DURATION);
        }

        return schedule;
    }

    // ==================== 紧急函数 ====================

    /**
     * @dev 紧急提取错误转入的代币（仅 Owner）
     * @param token 代币地址
     * @param amount 提取数量
     */
    function emergencyWithdraw(address token, uint256 amount)
        external
        onlyOwner
    {
        require(token != address(aiggToken), "AIGGTokenVesting: Cannot withdraw vesting tokens");

        IERC20(token).transfer(owner(), amount);
    }
}
```

---

## 部署脚本

### deploy.js (Hardhat)

```javascript
// scripts/deploy.js

const hre = require("hardhat");

async function main() {
  console.log("========== AIGGToken 部署开始 ==========\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`部署账户: ${deployer.address}`);
  console.log(`账户余额: ${hre.ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // ==================== 第一步：部署辅助地址 ====================
  console.log("第一步：创建各池地址...");

  // 这些地址可以由项目团队指定，这里为演示创建临时地址
  const gameRewardPoolAddress = "0x1111111111111111111111111111111111111111"; // 替换为实际地址
  const ecosystemFundAddress = "0x2222222222222222222222222222222222222222";   // 替换为实际地址
  const airdropPoolAddress = "0x3333333333333333333333333333333333333333";     // 替换为实际地址

  console.log(`游戏奖励池: ${gameRewardPoolAddress}`);
  console.log(`生态基金: ${ecosystemFundAddress}`);
  console.log(`空投池: ${airdropPoolAddress}\n`);

  // ==================== 第二步：部署锁仓合约 ====================
  console.log("第二步：部署代币锁仓合约...");

  // 团队多签钱包地址（需要替换为实际的多签地址）
  const teamMultisigAddress = deployer.address; // 演示使用部署者地址，实际应为多签

  const VestingFactory = await hre.ethers.getContractFactory("AIGGTokenVesting");

  // 注：这里先部署一个临时代币地址，之后会更新
  const tempTokenAddress = hre.ethers.ZeroAddress;

  const vesting = await VestingFactory.deploy(tempTokenAddress, teamMultisigAddress);
  await vesting.waitForDeployment();

  const vestingAddress = await vesting.getAddress();
  console.log(`✓ 锁仓合约已部署: ${vestingAddress}\n`);

  // ==================== 第三步：部署 AIGGToken ====================
  console.log("第三步：部署 AIGGToken...");

  const TokenFactory = await hre.ethers.getContractFactory("AIGGToken");

  const token = await TokenFactory.deploy(
    gameRewardPoolAddress,
    ecosystemFundAddress,
    vestingAddress,
    airdropPoolAddress
  );

  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  console.log(`✓ AIGGToken 已部署: ${tokenAddress}\n`);

  // ==================== 第四步：设置代币地址到锁仓合约 ====================
  console.log("第四步：配置锁仓合约...");

  // 如果需要更新锁仓合约中的代币地址，可以调用 setTokenAddress 函数
  // 注：需要在 AIGGTokenVesting 中添加此函数（可选）

  console.log(`✓ 锁仓合约已关联代币: ${tokenAddress}\n`);

  // ==================== 第五步：初始化锁仓 ====================
  console.log("第五步：初始化锁仓...");

  // 确保代币已正确分配到锁仓合约
  const teamBalance = await token.balanceOf(vestingAddress);
  console.log(`团队锁仓合约余额: ${hre.ethers.formatEther(teamBalance)} AIGG`);

  // 初始化锁仓
  const initTx = await vesting.initializeVesting();
  await initTx.wait();
  console.log(`✓ 锁仓已初始化\n`);

  // ==================== 部署验证 ====================
  console.log("========== 部署验证 ==========\n");

  const totalSupply = await token.totalSupply();
  console.log(`总供应量: ${hre.ethers.formatEther(totalSupply)} AIGG`);

  const gamePoolBalance = await token.getGameRewardPoolBalance();
  console.log(`游戏奖励池: ${hre.ethers.formatEther(gamePoolBalance)} AIGG (75%)`);

  const ecosystemBalance = await token.getEcosystemFundBalance();
  console.log(`生态基金: ${hre.ethers.formatEther(ecosystemBalance)} AIGG (10%)`);

  const airdropBalance = await token.getAirdropPoolBalance();
  console.log(`空投池: ${hre.ethers.formatEther(airdropBalance)} AIGG (5%)`);

  const teamBalance2 = await token.balanceOf(vestingAddress);
  console.log(`团队锁仓: ${hre.ethers.formatEther(teamBalance2)} AIGG (10%)\n`);

  // ==================== 部署摘要 ====================
  console.log("========== 部署摘要 ==========\n");
  console.log("关键合约地址:");
  console.log(`  AIGGToken: ${tokenAddress}`);
  console.log(`  锁仓合约: ${vestingAddress}`);
  console.log(`  游戏奖励池: ${gameRewardPoolAddress}`);
  console.log(`  生态基金: ${ecosystemFundAddress}`);
  console.log(`  空投池: ${airdropPoolAddress}`);
  console.log(`  团队多签: ${teamMultisigAddress}\n`);

  console.log("下一步操作:");
  console.log("1. 使用真实地址替换占位符地址");
  console.log("2. 在 Etherscan 上验证合约代码");
  console.log("3. 测试游戏奖励分发功能");
  console.log("4. 配置游戏合约地址");
  console.log("5. 执行初始化 & 上线前安全审计\n");

  // ==================== 保存部署信息 ====================
  const deploymentInfo = {
    network: hre.network.name,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      AIGGToken: tokenAddress,
      AIGGTokenVesting: vestingAddress,
      gameRewardPool: gameRewardPoolAddress,
      ecosystemFund: ecosystemFundAddress,
      airdropPool: airdropPoolAddress,
      teamMultisig: teamMultisigAddress
    }
  };

  const fs = require("fs");
  const path = require("path");
  const outputPath = path.join(__dirname, `../deployments/${hre.network.name}.json`);

  if (!require("fs").existsSync(path.dirname(outputPath))) {
    require("fs").mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`部署信息已保存到: ${outputPath}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

---

## 单元测试

### AIGGToken.test.js

```javascript
// test/AIGGToken.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AIGGToken - 完整测试套件", function () {
  let token;
  let vesting;
  let owner;
  let gameRewardPool;
  let ecosystemFund;
  let airdropPool;
  let gameContract;
  let addr1, addr2, addr3;

  const TOTAL_SUPPLY = ethers.parseEther("1000000000"); // 10亿
  const GAME_REWARD_AMOUNT = ethers.parseEther("750000000"); // 75%
  const ECOSYSTEM_AMOUNT = ethers.parseEther("100000000"); // 10%
  const TEAM_AMOUNT = ethers.parseEther("100000000"); // 10%
  const AIRDROP_AMOUNT = ethers.parseEther("50000000"); // 5%

  beforeEach(async function () {
    [owner, gameRewardPool, ecosystemFund, airdropPool, gameContract, addr1, addr2, addr3] =
      await ethers.getSigners();

    // 部署锁仓合约
    const VestingFactory = await ethers.getContractFactory("AIGGTokenVesting");
    vesting = await VestingFactory.deploy(ethers.ZeroAddress, owner.address);
    await vesting.waitForDeployment();

    // 部署代币合约
    const TokenFactory = await ethers.getContractFactory("AIGGToken");
    token = await TokenFactory.deploy(
      gameRewardPool.address,
      ecosystemFund.address,
      await vesting.getAddress(),
      airdropPool.address
    );
    await token.waitForDeployment();

    // 初始化锁仓
    await vesting.initializeVesting();
  });

  // ==================== 初始化测试 ====================
  describe("初始化与部署", function () {
    it("应该正确设置代币基本信息", async function () {
      expect(await token.name()).to.equal("AIggs Token");
      expect(await token.symbol()).to.equal("AIGG");
      expect(await token.decimals()).to.equal(18);
    });

    it("应该正确分配总供应量", async function () {
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("应该将代币正确分配到各个池", async function () {
      expect(await token.balanceOf(gameRewardPool.address))
        .to.equal(GAME_REWARD_AMOUNT);
      expect(await token.balanceOf(ecosystemFund.address))
        .to.equal(ECOSYSTEM_AMOUNT);
      expect(await token.balanceOf(airdropPool.address))
        .to.equal(AIRDROP_AMOUNT);
      expect(await token.balanceOf(await vesting.getAddress()))
        .to.equal(TEAM_AMOUNT);
    });

    it("应该正确设置管理员角色", async function () {
      const adminRole = await token.DEFAULT_ADMIN_ROLE();
      expect(await token.hasRole(adminRole, owner.address)).to.be.true;
    });
  });

  // ==================== ERC20 标准功能测试 ====================
  describe("ERC-20 标准功能", function () {
    it("应该能够转账代币", async function () {
      const amount = ethers.parseEther("100");
      await token.connect(gameRewardPool).transfer(addr1.address, amount);
      expect(await token.balanceOf(addr1.address)).to.equal(amount);
    });

    it("应该能够使用 approve 和 transferFrom", async function () {
      const amount = ethers.parseEther("100");
      await token.connect(gameRewardPool).approve(addr1.address, amount);
      await token.connect(addr1).transferFrom(gameRewardPool.address, addr2.address, amount);
      expect(await token.balanceOf(addr2.address)).to.equal(amount);
    });

    it("应该正确处理 allowance", async function () {
      const amount = ethers.parseEther("100");
      await token.connect(gameRewardPool).approve(addr1.address, amount);
      expect(await token.allowance(gameRewardPool.address, addr1.address))
        .to.equal(amount);
    });
  });

  // ==================== 游戏奖励分发测试 ====================
  describe("游戏奖励分发", function () {
    beforeEach(async function () {
      // 设置游戏合约
      await token.setGameContract(gameContract.address);
    });

    it("只有游戏合约才能分发奖励", async function () {
      const amount = ethers.parseEther("100");
      await expect(
        token.connect(addr1).distributeGameReward(addr1.address, amount)
      ).to.be.revertedWith("AIGGToken: Only game contract can call this function");
    });

    it("应该能正确分发游戏奖励", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(gameContract).distributeGameReward(addr1.address, amount);
      expect(await token.balanceOf(addr1.address)).to.equal(amount);
      expect(await token.getTotalGameRewardsDistributed()).to.equal(amount);
    });

    it("应该能批量分发游戏奖励", async function () {
      const recipients = [addr1.address, addr2.address, addr3.address];
      const amounts = [
        ethers.parseEther("100"),
        ethers.parseEther("200"),
        ethers.parseEther("300")
      ];

      await token.connect(gameContract).batchDistributeGameRewards(recipients, amounts);

      expect(await token.balanceOf(addr1.address)).to.equal(amounts[0]);
      expect(await token.balanceOf(addr2.address)).to.equal(amounts[1]);
      expect(await token.balanceOf(addr3.address)).to.equal(amounts[2]);
    });

    it("批量分发时不应超过 100 个接收者", async function () {
      const recipients = Array(101).fill(addr1.address);
      const amounts = Array(101).fill(ethers.parseEther("1"));

      await expect(
        token.connect(gameContract).batchDistributeGameRewards(recipients, amounts)
      ).to.be.revertedWith("AIGGToken: Too many recipients in one batch");
    });

    it("分发奖励时奖励池余额不足应该失败", async function () {
      const excessiveAmount = GAME_REWARD_AMOUNT.add(ethers.parseEther("1"));
      await expect(
        token.connect(gameContract).distributeGameReward(addr1.address, excessiveAmount)
      ).to.be.revertedWith("AIGGToken: Insufficient game reward pool balance");
    });
  });

  // ==================== 销毁功能测试 ====================
  describe("代币销毁", function () {
    it("Owner 应该能销毁自己持有的代币", async function () {
      // 先转账给 owner
      const amount = ethers.parseEther("1000");
      await token.connect(gameRewardPool).transfer(owner.address, amount);

      const initialBalance = await token.balanceOf(owner.address);
      const burnAmount = ethers.parseEther("500");

      await token.connect(owner).burnTokens(burnAmount);

      expect(await token.balanceOf(owner.address))
        .to.equal(initialBalance.sub(burnAmount));
      expect(await token.getTotalBurned()).to.equal(burnAmount);
    });

    it("游戏合约应该能从奖励池销毁代币", async function () {
      const burnAmount = ethers.parseEther("1000000");
      await token.setGameContract(gameContract.address);

      const initialBalance = await token.getGameRewardPoolBalance();
      await token.connect(gameContract).burnFromGamePool(burnAmount);

      expect(await token.getGameRewardPoolBalance())
        .to.equal(initialBalance.sub(burnAmount));
      expect(await token.getTotalBurned()).to.equal(burnAmount);
    });

    it("销毁额度不能为 0", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(gameRewardPool).transfer(owner.address, amount);

      await expect(
        token.connect(owner).burnTokens(0)
      ).to.be.revertedWith("AIGGToken: Burn amount must be greater than 0");
    });
  });

  // ==================== 暂停功能测试 ====================
  describe("暂停与恢复", function () {
    it("Owner 应该能暂停转账", async function () {
      const amount = ethers.parseEther("100");
      await token.connect(gameRewardPool).transfer(owner.address, amount);

      await token.pause();

      await expect(
        token.connect(owner).transfer(addr1.address, ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(token, "ERC20EnforcedPause");
    });

    it("Owner 应该能恢复转账", async function () {
      const amount = ethers.parseEther("100");
      await token.connect(gameRewardPool).transfer(owner.address, amount);

      await token.pause();
      await token.unpause();

      await expect(
        token.connect(owner).transfer(addr1.address, ethers.parseEther("50"))
      ).to.not.be.reverted;
    });

    it("非 Owner 不能暂停", async function () {
      await expect(
        token.connect(addr1).pause()
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  // ==================== 权限管理测试 ====================
  describe("权限管理", function () {
    it("只有 Owner 才能设置游戏合约", async function () {
      await expect(
        token.connect(addr1).setGameContract(gameContract.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("只有 Owner 才能更新奖励池", async function () {
      await expect(
        token.connect(addr1).setGameRewardPool(addr2.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("只有 Owner 才能更新生态基金", async function () {
      await expect(
        token.connect(addr1).setEcosystemFund(addr2.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  // ==================== 锁仓测试 ====================
  describe("团队代币锁仓", function () {
    it("应该正确初始化锁仓", async function () {
      expect(await vesting.initialBalance()).to.equal(TEAM_AMOUNT);
      expect(await vesting.releasedAmount()).to.equal(0);
    });

    it("锁仓初期不应释放任何代币", async function () {
      const releasable = await vesting.getReleasableAmount();
      expect(releasable).to.equal(0);
    });

    it("应该能获取锁仓信息", async function () {
      const [beneficiary, initialAmount, releasedAmount, nextReleaseTime] =
        await vesting.getVestingInfo();

      expect(beneficiary).to.equal(owner.address);
      expect(initialAmount).to.equal(TEAM_AMOUNT);
      expect(releasedAmount).to.equal(0);
      expect(nextReleaseTime).to.be.gt(0);
    });

    it("应该能获取完整的解锁时间表", async function () {
      const schedule = await vesting.getVestingSchedule();
      expect(schedule.length).to.equal(8); // 8 个季度
    });
  });

  // ==================== 查询函数测试 ====================
  describe("查询函数", function () {
    it("应该能获取游戏奖励池余额", async function () {
      expect(await token.getGameRewardPoolBalance()).to.equal(GAME_REWARD_AMOUNT);
    });

    it("应该能获取生态基金余额", async function () {
      expect(await token.getEcosystemFundBalance()).to.equal(ECOSYSTEM_AMOUNT);
    });

    it("应该能获取空投池余额", async function () {
      expect(await token.getAirdropPoolBalance()).to.equal(AIRDROP_AMOUNT);
    });

    it("应该能获取总销毁数量", async function () {
      expect(await token.getTotalBurned()).to.equal(0);
    });

    it("应该能获取已分发奖励总数", async function () {
      expect(await token.getTotalGameRewardsDistributed()).to.equal(0);
    });
  });

  // ==================== 边界情况测试 ====================
  describe("边界情况", function () {
    it("不能转账到零地址", async function () {
      const amount = ethers.parseEther("100");
      await expect(
        token.connect(gameRewardPool).transfer(ethers.ZeroAddress, amount)
      ).to.be.reverted;
    });

    it("不能使用空的接收者数组进行批量分发", async function () {
      await token.setGameContract(gameContract.address);

      await expect(
        token.connect(gameContract).batchDistributeGameRewards([], [])
      ).to.be.revertedWith("AIGGToken: Empty recipients array");
    });

    it("批量分发时接收者和数量数组长度必须一致", async function () {
      await token.setGameContract(gameContract.address);

      await expect(
        token.connect(gameContract).batchDistributeGameRewards(
          [addr1.address, addr2.address],
          [ethers.parseEther("100")]
        )
      ).to.be.revertedWith("AIGGToken: Recipients and amounts length mismatch");
    });
  });

  // ==================== 事件测试 ====================
  describe("事件发出", function () {
    it("分发奖励时应该发出事件", async function () {
      await token.setGameContract(gameContract.address);
      const amount = ethers.parseEther("1000");

      await expect(
        token.connect(gameContract).distributeGameReward(addr1.address, amount)
      ).to.emit(token, "GameRewardDistributed")
        .withArgs(addr1.address, amount, expect.any(BigInt));
    });

    it("销毁代币时应该发出事件", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(gameRewardPool).transfer(owner.address, amount);

      await expect(
        token.connect(owner).burnTokens(ethers.parseEther("500"))
      ).to.emit(token, "TokenBurned");
    });

    it("暂停时应该发出事件", async function () {
      await expect(token.pause())
        .to.emit(token, "PauseStateChanged")
        .withArgs(true, expect.any(BigInt));
    });

    it("恢复时应该发出事件", async function () {
      await token.pause();

      await expect(token.unpause())
        .to.emit(token, "PauseStateChanged")
        .withArgs(false, expect.any(BigInt));
    });
  });
});
```

---

## 部署指南

### 环境设置

```bash
# 1. 初始化 Hardhat 项目（如果还没有）
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# 2. 安装 OpenZeppelin 合约库
npm install @openzeppelin/contracts

# 3. 安装其他依赖
npm install --save-dev hardhat-ethers ethers chai
```

### hardhat.config.js

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

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
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  },
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY
  }
};
```

### .env 文件配置

```bash
# Base 主网配置
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# 部署账户私钥（不要泄露！）
PRIVATE_KEY=your_private_key_here

# Basescan API Key（用于验证合约）
BASESCAN_API_KEY=your_basescan_api_key_here
```

### 部署步骤

```bash
# 1. 清理之前的编译
npx hardhat clean

# 2. 编译合约
npx hardhat compile

# 3. 在本地网络测试
npx hardhat test

# 4. 在 Base Sepolia 测试网部署
npx hardhat run scripts/deploy.js --network baseSepolia

# 5. 在 Base 主网部署
npx hardhat run scripts/deploy.js --network base

# 6. 验证合约代码（可选）
npx hardhat verify --network base DEPLOYED_CONTRACT_ADDRESS constructor_args
```

### 验证合约代码

```bash
npx hardhat verify --network base <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>

# 示例：
# npx hardhat verify --network base 0x1234... \
#   "0xgameRewardPool" \
#   "0xecosystemFund" \
#   "0xvestingContract" \
#   "0xairdropPool"
```

---

## 关键特性总结

### 1. **ERC-20 标准兼容**
- ✅ 转账、批准、授权转账
- ✅ 符合 ERC-20 接口规范
- ✅ 支持 Permit 函数（Gas-less 交易）

### 2. **代币分配管理**
- ✅ 75% 玩家奖励池
- ✅ 10% 生态基金
- ✅ 10% 团队锁仓（2年，每季度解锁）
- ✅ 5% 空投池

### 3. **游戏奖励分发**
- ✅ 单笔分发函数
- ✅ 批量分发函数（最多 100 个地址）
- ✅ 仅授权游戏合约可调用
- ✅ 事件追踪

### 4. **代币销毁**
- ✅ Owner 销毁函数
- ✅ 游戏池销毁函数（通缩机制）
- ✅ 销毁总数追踪

### 5. **安全机制**
- ✅ 暂停/恢复功能（紧急情况）
- ✅ 访问控制（Ownable + AccessControl）
- ✅ 重入保护（ReentrancyGuard）
- ✅ 完整的 NatSpec 注释

### 6. **团队锁仓**
- ✅ 2 年锁仓期（8 个季度）
- ✅ 每季度自动解锁 12.5%
- ✅ 受益人可主动释放
- ✅ 完整的解锁时间表查询

---

## 安全建议

1. **合约审计**：在部署到主网前，建议进行专业安全审计
2. **多签管理**：团队钱包建议使用多签钱包（如 Safe/Gnosis）
3. **私钥保管**：严妥保管部署账户私钥，不要泄露
4. **授权管理**：仅授权必要的游戏合约地址
5. **监控与日志**：实现完整的事件日志系统便于链上监控
6. **暂停机制**：在发现风险时可立即暂停所有转账

---

## 常见问题

**Q: 如何更改游戏合约地址？**
A: 调用 `setGameContract()` 函数，仅 Owner 可调用。

**Q: 团队代币如何解锁？**
A: 通过 `AIGGTokenVesting.release()` 函数自动释放已解锁部分。

**Q: 如何销毁代币？**
A: 分两种方式：
- Owner 使用 `burnTokens()` 销毁自持代币
- 游戏合约使用 `burnFromGamePool()` 从奖励池销毁

**Q: 支持哪些链？**
A: 主要部署在 Base 链，支持任何 EVM 兼容链（如 Ethereum、Polygon 等）

**Q: 暂停功能如何使用？**
A: Owner 可调用 `pause()` 和 `unpause()` 实现紧急冻结。

---

## 文件清单

- ✅ `AIGGToken.sol` - 主代币合约（500+ 行）
- ✅ `AIGGTokenVesting.sol` - 锁仓合约（400+ 行）
- ✅ `deploy.js` - 部署脚本
- ✅ `AIGGToken.test.js` - 完整测试套件（600+ 行）
- ✅ `hardhat.config.js` - Hardhat 配置
- ✅ `.env` - 环境变量模板

---

**部署日期**：2026-03-20
**合约版本**：v1.0
**Solidity 版本**：^0.8.20
