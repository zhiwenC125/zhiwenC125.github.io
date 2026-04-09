---
title: Leetcode Hot100 Day2
date: 2026-04-08 00:51:56
tags:
---

# Leetcode Hot 100 双指针

## 哈希表基础知识(STL标准库)
1. **容器选择** `unordered_map`哈希表 vs `unordered_set`集合
- `unordered_set<K>`：只有键的哈希集合。当需要去重，或者只关心元素存在吗才使用，因为它比map更加节省内存
- `unordered_map<K, V>`：完整的哈希表，当需要建立关联的时候使用
- 避坑：面试或者刷题的时候，如果题目要求最后的输出结果必须要按照大小顺序排列，否则的话优先使用带ordered前缀的版本，因为它查找的时间复杂度是$O(1)$，另外它的底层就是哈希表。不带前缀的map/set底层是红黑树，查找时间复杂度是$O(logn)$，速度会被拖慢
---
2. unoerder_map和unordered_set查看数据的方法
判断元素是否在哈希表/集合的两种标准方法：
- `count(key)`：返回0或1.最简单的判断方法：`if(hash.count(key))`
- `find(key)`：返回迭代器。如果找到了，那么可以再一次用迭代器拿值，这一个是直接可以找到这个值是否存在的；如果没找到那就是返回hash.end()，代表着返回了哈希表最后面的无元素的值
    - 标准形式：`if(hash.find(key) != hash.end())`, `hash.end()`后面是没有数据的
---
3. 让代码更加便捷
- auto类型推导：可以不用手写冗长的迭代器类型。直接`auto it = mp.begin`，让编译器帮忙干活
- for循环与引用
    - 迭代器遍历：适用于所有STL容器
        ```cpp
        for(auto it = mp.begin(); it != mp.end; iit++){}
        ```
    - 基于范围的for循环，刷题最推荐
        ```cpp
        for(const int &num: nums){} // 直接操作原数据，不用多复制浪费时间复杂度，实现零拷贝
        for(const auto &[key, value] : mp){} // 添加const是为了防止修改
        ```
---
4. 排序
在处理异位词、合并区间等题目时候，头文件<algorithm>里面的sort是yyds
- 用法：`sort(v.begin(), v.end())`，这里的v是一个列表
- 复杂度：时间$O(n log n)$，它是一个经过高度优化的内省排序
---
## 两数之和
- 难点：在采用传统的暴力求解的情况之下，会出现导致时间复杂度指数叠加$O(n^2)$
- 求解：哈希表在这里可以去查找当前target数字所需要的另一半，
如果说没有找到的话，它会将当前遍历的数字的位置和值进行存储，形成一个映射，为后面的数字进行准备
- 容器选择：在这里以为结果是数组的下标，而不是数组里面的值，而数组的值和数组的下表具有**映射关系**，值只是中间目标，所以采用具有映射关系的unordered_map更加好
```cpp
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> Harsh_table;
        for(int i = 0; i < nums.size(); i++){
            int needed = target - nums[i]; // 可以明显看出数组的值是一个中间变量
            if(Harsh_table.find(needed) != Harsh_table.end()){
                return {Harsh_table[needed], i};
            }
            Harsh_table[nums[i]] = i; // nums[i]是数组的值，对应成Python那就是{value「nums[i]」: key「i」}
        }
        return {};
    }
};
```

## 字母异位词分组

- 难点：如何判断长得不同的字符串是为同一类(包含相同的字符串)
- 求解：观察给出的案例和答案，会发现其实是将字符串相同但排序不相同的归为一类，于是可以将一类排序的结果当作是哈希表/字典里面的键，因为他们排序之后样子都会是一致的，而原始的放进这个键对应的值数组，进行不同组别的分类，于是就可以的得出相关的结果
- 容器选择：因为是键值对，而键是字符串的大类，值是未排序这些字符串的数组，因此采用哈希表：`unordered_map<string, vector<string>>`
```cpp
class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        unordered_map<string, vector<string>> map;
        for(auto s: strs){
            string t = s;
            sort(t.begin(), t.end());

            map[t].push_back(s); // 将同类型的字符串加入到修正后的类型中
        }

        vector<vector<string>> answer;
        for(auto it = map.begin(); it != map.end(); it++){
            answer.push_back(it->second); // first是键，second是值
        }
        return answer;
    }
};
```

## 最长连续数列
- 难点：单纯的排序会导致$O(nlogn)$的时间复杂度，而题目严格要求智能$O(n)$
- 求解：需要利用哈希表将每一个数据存储，那么查找哈希表该数据时候只会有$O(1)$的时间复杂度，那么首先利用单次遍历的循环也就是$O(1)$进行多次遍历之后，在`num-1`找出第一个数字，而找出第一个数之后`while(num_set.count(currentNum + 1))`自然向后遍历，顺藤摸瓜，就可以查完整个连续序列的长度
- 容器选择：因为不需要返回出索引也就是下标，整个结果都是面对着集合里面的值进行查询的，所以不需要键值对的map，这里最好采用set集合的方式，因为不需要记录额外的信息，所以采用`unordered_set`
```cpp
class Solution {
public:
    int longestConsecutive(vector<int>& nums) {
        unordered_set<int> num_set(nums.begin(), nums.end());
        int longestSequence = 0;
        for(const int &num : num_set){
            if(!num_set.count(num - 1)){
                int currentNum = num;
                int currentLength = 1; // 找到第一位的单词将连续性的长度设置为1
                // 开始遍历后面是否有连续的数
                while(num_set.count(currentNum + 1)){
                    // 在当前数之后开始遍历，看看有没有连续的
                    // 如果说找到了，那么就是遍历了num_set的次数
                    currentNum += 1; // 如果是连续的数字那就到后面的数字
                    currentLength += 1;
                }

                longestSequence = max(currentLength, longestSequence);
            }
        }
        return longestSequence;
    }
};
```
## 总结：什么时候用集合，什么时候用哈希表
1. 哈希表
    - 需要关键的额外信息，简单来说存在映射的关系
        - 找位置：两数之和，根据数值之和找出两个数的下标
        - 统计频率：记录一个数组里面，高频数字的出现次数
        - 分组归类：像是字符异位分组，将根据排序之后的字符串存档在同类的列表
    - 需要更新状态：涉及到“如果这个数出现，就把它对应的计数加1”， 这种有增量更新的需求操作
2. 集合
    - 单纯成员的检查
        - 防止重复的遍历
        - 查缺补漏，需要知道某个数字是否在集合里
        - 寻找序列起点(因为它只关心下次数据对于单词数据是否连续也就是仅仅大于1，因此无需要再多的重复数据)，像最长连续数列，只需要判断第一个数是否存在即可顺藤摸瓜继续找
    - 自动去重：只关心一个数组出现过什么数字，直接将数组丢进集合即可去重
