/**
 * 堆内存管理器
 * 模拟 FreeRTOS heap_4 风格的内存分配 (首次适配 + 合并空闲块)
 */

class HeapBlock {
    constructor(address, size, free, label) {
        this.address = address;
        this.size = size;
        this.free = free;
        this.label = label || '';     // 分配者标签 (如 "Task1_stack")
        this.next = null;
    }
}

class HeapManager {
    constructor(totalSize) {
        this.totalSize = totalSize;
        this.headerSize = 8;          // 每个块的元数据开销 (模拟 BlockLink_t)
        this.minBlockSize = 16;       // 最小分配单位
        this.freeBytesRemaining = totalSize - this.headerSize;
        this.minimumEverFreeBytesRemaining = this.freeBytesRemaining;
        this.allocCount = 0;
        this.freeCount = 0;

        // 空闲链表头
        this.head = new HeapBlock(0, this.headerSize, false, 'HEAD');
        // 初始大空闲块
        const firstFree = new HeapBlock(this.headerSize, totalSize - this.headerSize, true, '');
        this.head.next = firstFree;

        // 所有块列表 (用于可视化)
        this.allBlocks = [this.head, firstFree];

        // 分配历史
        this.history = [];
    }

    // 首次适配分配
    malloc(requestedSize, label) {
        if (requestedSize <= 0) return null;

        // 对齐到 8 字节
        let actualSize = this._align(requestedSize + this.headerSize);
        if (actualSize < this.minBlockSize) actualSize = this.minBlockSize;

        // 遍历空闲链表找到首个足够大的块
        let prev = this.head;
        let current = this.head.next;

        while (current) {
            if (current.free && current.size >= actualSize) {
                // 找到合适块
                const remaining = current.size - actualSize;

                if (remaining >= this.minBlockSize) {
                    // 分割块
                    const newFree = new HeapBlock(
                        current.address + actualSize,
                        remaining,
                        true,
                        ''
                    );
                    newFree.next = current.next;
                    current.next = newFree;
                    current.size = actualSize;
                    this.allBlocks.push(newFree);
                }

                current.free = false;
                current.label = label || `alloc_${this.allocCount}`;
                this.freeBytesRemaining -= current.size;

                if (this.freeBytesRemaining < this.minimumEverFreeBytesRemaining) {
                    this.minimumEverFreeBytesRemaining = this.freeBytesRemaining;
                }

                this.allocCount++;
                this.history.push({
                    type: 'malloc',
                    address: current.address,
                    size: current.size,
                    label: current.label
                });

                return current;
            }
            prev = current;
            current = current.next;
        }

        // 分配失败
        this.history.push({ type: 'malloc_fail', size: requestedSize, label });
        return null;
    }

    // 释放内存
    free(address) {
        let prev = this.head;
        let current = this.head.next;

        while (current) {
            if (current.address === address && !current.free) {
                current.free = true;
                const oldLabel = current.label;
                current.label = '';
                this.freeBytesRemaining += current.size;
                this.freeCount++;

                this.history.push({
                    type: 'free',
                    address: current.address,
                    size: current.size,
                    label: oldLabel
                });

                // 合并相邻空闲块
                this._coalesce();
                return true;
            }
            prev = current;
            current = current.next;
        }
        return false;
    }

    // 合并相邻空闲块
    _coalesce() {
        let current = this.head.next;
        while (current && current.next) {
            if (current.free && current.next.free) {
                const merged = current.next;
                current.size += merged.size;
                current.next = merged.next;
                // 从 allBlocks 中移除
                const idx = this.allBlocks.indexOf(merged);
                if (idx !== -1) this.allBlocks.splice(idx, 1);
            } else {
                current = current.next;
            }
        }
    }

    // 8字节对齐
    _align(size) {
        return Math.ceil(size / 8) * 8;
    }

    // 获取有序块列表 (用于可视化)
    getBlocksOrdered() {
        const blocks = [];
        let current = this.head.next; // 跳过 HEAD
        while (current) {
            blocks.push(current);
            current = current.next;
        }
        return blocks;
    }

    // 碎片率
    getFragmentation() {
        const blocks = this.getBlocksOrdered();
        const freeBlocks = blocks.filter(b => b.free);
        if (freeBlocks.length <= 1) return 0;
        const largestFree = Math.max(...freeBlocks.map(b => b.size));
        const totalFree = freeBlocks.reduce((s, b) => s + b.size, 0);
        return totalFree > 0 ? (1 - largestFree / totalFree) * 100 : 0;
    }

    getStats() {
        return {
            total: this.totalSize,
            free: this.freeBytesRemaining,
            used: this.totalSize - this.freeBytesRemaining,
            minEverFree: this.minimumEverFreeBytesRemaining,
            fragmentation: this.getFragmentation().toFixed(1),
            allocCount: this.allocCount,
            freeCount: this.freeCount
        };
    }

    reset() {
        const size = this.totalSize;
        this.freeBytesRemaining = size - this.headerSize;
        this.minimumEverFreeBytesRemaining = this.freeBytesRemaining;
        this.allocCount = 0;
        this.freeCount = 0;
        this.head = new HeapBlock(0, this.headerSize, false, 'HEAD');
        const firstFree = new HeapBlock(this.headerSize, size - this.headerSize, true, '');
        this.head.next = firstFree;
        this.allBlocks = [this.head, firstFree];
        this.history = [];
    }
}
