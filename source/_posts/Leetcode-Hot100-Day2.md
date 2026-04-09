---
title: Leetcode Hot100 Day3
date: 2026-04-10 03:16:46
tags:
---

# Leetcode Hot 100 双指针

## 双指针基础知识(STL标准库与核心思想)
1. **核心算法库** `<algorithm>`
- `sort(v.begin(), v.end())`：对撞指针的绝对前提。处理三数之和等题目时，必须先将数组排序，时间复杂度 $O(n \log n)$。
- `swap(a, b)`：快慢指针原地修改数组的利器，直接交换两个元素，代码安全且简洁，避免手动写多行赋值逻辑。
- `max(a, b)` / `min(a, b)`：在处理木桶效应（接雨水）、求最大面积（盛最多水的容器）时必用的比对函数。
---
2. **防溢出与边界控制**
- 循环条件：对撞指针绝大多数情况使用 `while(left < right)`，当左右指针相遇时说明所有区间已排查完毕，搜索结束。
- 符号整数溢出 (`signed integer overflow`)：当遇到这个报错，通常是因为指针走反了（如该 `left++` 写成了 `left--`），导致 `right - left` 变成巨大的负数参与乘法运算，或者数组下标越界。
- 数组越界安全：`vector.size()` 返回的是无符号整数。双指针初始化 `int right = nums.size() - 1` 时，如果数组为空会导致下溢出，刷题时最好养成先判空或者赋给 `int n = nums.size()` 的习惯。
---

## 移动零

- 难点：题目要求必须在不复制数组的情况下原地对数组进行操作，且要保持非零元素的相对顺序。
- 求解：利用快慢指针，快指针相当于侦察兵，不断向后寻找非零元素；慢指针相当于管理员，标记当前非零元素应该安放的位置。遇到非零元素就与慢指针位置交换，完美将 0 甩到后面。
- 指针策略：同向快慢指针。这是原地修改数组和“清理现场”的标准打法。
```cpp
class Solution {
public:
    void moveZeroes(vector<int>& nums) {
        // slow 记录非零元素应该放置的位置
        for (int slow = 0, fast = 0; fast < nums.size(); ++fast) {
            if (nums[fast] != 0) {
                // 发现非零数，与 slow 指向的位置交换
                swap(nums[slow], nums[fast]);
                slow++;
            }
        }
    }
};
```
## 盛最多水的容器
- 难点：如果使用双重循环暴力枚举所有组合，时间复杂度是 $O(n^2)$，必定会超时。需要一种策略在一次遍历中合法地舍弃无用状态。
- 求解：容量由宽度和高度（短板）共同决定。初始双指针在两端，此时宽度最大；向内收缩时宽度必减。若要面积增大，只能指望高度增加。因此，移动长板面积只会减小，只有移动短板才有可能遇到更高的板，从而弥补宽度的损失。
- 指针策略：相向对撞指针。利用“贪心”和“排除法”不断舍弃必定更小的边界。
```Cpp
class Solution {
public:
    int maxArea(vector<int>& height) {
        int left = 0, right = height.size() - 1;
        int max_v = 0; 
        while(left < right){
            int current_h = min(height[left], height[right]);
            max_v = max(max_v, current_h * (right - left));
            
            // 谁矮抛弃谁，向中间靠拢寻找更高可能
            if(height[left] < height[right]) left++;
            else right--;
        }
        return max_v;
    }
};
```
## 三数之和
- 难点：如何在 $O(n^2)$ 时间复杂度内找齐所有组合，并且彻底避免结果集中出现重复的三元组（去重逻辑极易写错导致死循环或漏解）。
- 求解：先将数组排序，然后通过一层 for 循环固定数字 $a$，将问题降维转化成在剩余的有序数组中寻找两数之和为 $-a$。
- 指针策略：对撞指针。严格遵守“找到解后才去重，去重后双双向中间迈步”的铁律。
```C++
class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        vector<vector<int>> res;
        sort(nums.begin(), nums.end()); // 必须排序
        
        for(int i = 0; i < nums.size(); i++){
            if(nums[i] > 0) break; // 剪枝：最小的数都大于0，不可能和为0
            if(i > 0 && nums[i] == nums[i - 1]) continue; // 固定端 i 去重

            int left = i + 1, right = nums.size() - 1;
            while(left < right){
                int sum = nums[i] + nums[left] + nums[right];
                if (sum > 0) right--;
                else if (sum < 0) left++;
                else {
                    res.push_back({nums[i], nums[left], nums[right]});
                    // 收获结果后进行严格去重
                    while(left < right && nums[left] == nums[left + 1]) left++;
                    while(left < right && nums[right] == nums[right - 1]) right--;
                    // 去重后，左右指针同时向中间走一步
                    left++;
                    right--;
                }
            }
        }
        return res;
    }
};
```
## 接雨水
- 难点：某一个位置的蓄水量取决于它左右两侧最高柱子中较矮的那一个（木桶效应）。传统动态规划需要 $O(n)$ 空间，如何优化到 $O(1)$？
- 求解：双指针从两端向中间遍历，动态维护 l_max 和 r_max。如果 l_max < r_max，说明左侧遇到了短板，右侧再怎么高也没用，此时左侧格子的蓄水量被直接确定，结算后指针右移。
- 指针策略：相向对撞指针。局部最值结合木桶原理的极致推导。
```C++
class Solution {
public:
    int trap(vector<int>& height) {
        if (height.empty()) return 0;
        int left = 0, right = height.size() - 1;
        int l_max = 0, r_max = 0, res = 0;

        while (left < right) {
            l_max = max(l_max, height[left]);
            r_max = max(r_max, height[right]);

            // 哪边是短板，就结算哪边
            if (l_max < r_max) {
                res += l_max - height[left];
                left++; 
            } else {
                res += r_max - height[right];
                right--; 
            }
        }
        return res;
    }
};
```
## 总结：什么时候用对撞指针，什么时候用同向快慢指针
1. 对撞指针 (一头一尾，相向而行 left++, right--)
    - 利用有序性排除无效解：如“有序数组”求和配对（三数之和）。
    - 求最大面积/极值：寻找最优区间，初始在两端以获得最大宽度，通过舍弃短板逼近极值（盛最多水的容器、接雨水）。
    - 核心思想：利用单调性做排除法，每次移动都在放弃不可能的区间。
2. 同向快慢指针 (同一起点，同向移动 fast++, slow++)
    - 原地修改与清理现场：fast 找目标，slow 当坑位，通过 swap 覆盖多余元素（移动零、删除有序数组重复项）。
    - 测链表结构：利用快慢速度差，找链表环、找中点。
    - 核心思想：维护一个已处理/未处理的边界，或者利用相对速度解决无索引访问问题。