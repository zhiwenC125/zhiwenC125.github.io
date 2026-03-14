/**
 * IPC 原语: 消息队列、互斥量、信号量
 */

// ============ 消息队列 ============
class MessageQueue {
    constructor(name, maxLength, itemSize) {
        this.name = name;
        this.maxLength = maxLength;
        this.itemSize = itemSize;
        this.items = [];                  // 队列内容
        this.waitingToSend = [];          // 等待发送的任务
        this.waitingToReceive = [];       // 等待接收的任务
    }

    // 发送消息 (从任务上下文调用)
    send(kernel, data, ticksToWait) {
        if (this.items.length < this.maxLength) {
            this.items.push(data);
            kernel.log(`队列[${this.name}]: ${kernel.currentTask.name} 发送 "${data}"`);

            // 唤醒等待接收的任务
            if (this.waitingToReceive.length > 0) {
                const waiter = this.waitingToReceive.shift();
                kernel.unblockTask(waiter);
            }
            return true;
        } else {
            // 队列已满, 阻塞发送者
            if (ticksToWait > 0) {
                this.waitingToSend.push(kernel.currentTask);
                kernel.blockCurrentTask(`队列[${this.name}]满`, ticksToWait, this);
            }
            kernel.log(`队列[${this.name}]: 满! ${kernel.currentTask ? kernel.currentTask.name : '?'} 阻塞`);
            return false;
        }
    }

    // 接收消息
    receive(kernel, ticksToWait) {
        if (this.items.length > 0) {
            const data = this.items.shift();
            kernel.log(`队列[${this.name}]: ${kernel.currentTask.name} 接收 "${data}"`);

            // 唤醒等待发送的任务
            if (this.waitingToSend.length > 0) {
                const waiter = this.waitingToSend.shift();
                kernel.unblockTask(waiter);
            }
            return data;
        } else {
            // 队列为空, 阻塞接收者
            if (ticksToWait > 0) {
                this.waitingToReceive.push(kernel.currentTask);
                kernel.blockCurrentTask(`队列[${this.name}]空`, ticksToWait, this);
            }
            return null;
        }
    }

    isFull() { return this.items.length >= this.maxLength; }
    isEmpty() { return this.items.length === 0; }
    getCount() { return this.items.length; }
}

// ============ 互斥量 (Mutex) ============
class Mutex {
    constructor(name) {
        this.name = name;
        this.locked = false;
        this.owner = null;               // 持有者 TCB
        this.waitingTasks = [];           // 等待获取的任务列表
        this.recursiveCount = 0;          // 递归计数
    }

    // 获取互斥量
    take(kernel, ticksToWait) {
        const task = kernel.currentTask;
        if (!task) return false;

        if (!this.locked) {
            // 未锁定，直接获取
            this.locked = true;
            this.owner = task;
            this.recursiveCount = 1;
            kernel.log(`互斥量[${this.name}]: ${task.name} 获取`);
            return true;
        } else if (this.owner === task) {
            // 递归获取
            this.recursiveCount++;
            kernel.log(`互斥量[${this.name}]: ${task.name} 递归获取 (count=${this.recursiveCount})`);
            return true;
        } else {
            // 被其他任务持有
            if (ticksToWait > 0) {
                // 优先级继承: 如果等待者优先级更高，提升持有者优先级
                if (task.priority > this.owner.priority) {
                    kernel.log(`优先级继承: ${this.owner.name} P${this.owner.priority} -> P${task.priority}`);
                    this.owner.priority = task.priority;
                }
                this.waitingTasks.push(task);
                kernel.blockCurrentTask(`互斥量[${this.name}]`, ticksToWait, this);
            }
            kernel.log(`互斥量[${this.name}]: ${task.name} 等待 (持有者: ${this.owner.name})`);
            return false;
        }
    }

    // 释放互斥量
    give(kernel) {
        const task = kernel.currentTask;
        if (!task || this.owner !== task) return false;

        this.recursiveCount--;
        if (this.recursiveCount > 0) {
            kernel.log(`互斥量[${this.name}]: ${task.name} 递归释放 (count=${this.recursiveCount})`);
            return true;
        }

        // 恢复基础优先级
        if (task.priority !== task.basePriority) {
            kernel.log(`优先级恢复: ${task.name} P${task.priority} -> P${task.basePriority}`);
            task.priority = task.basePriority;
        }

        this.locked = false;
        this.owner = null;
        kernel.log(`互斥量[${this.name}]: ${task.name} 释放`);

        // 唤醒最高优先级的等待任务
        if (this.waitingTasks.length > 0) {
            // 按优先级排序
            this.waitingTasks.sort((a, b) => b.priority - a.priority);
            const next = this.waitingTasks.shift();
            kernel.unblockTask(next);
        }
        return true;
    }
}

// ============ 信号量 (Semaphore) ============
class Semaphore {
    constructor(name, maxCount, initialCount) {
        this.name = name;
        this.maxCount = maxCount;         // 最大计数 (1 = 二值信号量)
        this.count = initialCount !== undefined ? initialCount : maxCount;
        this.waitingTasks = [];           // 等待的任务
        this.flashGive = false;           // give 动作闪烁标记 (用于可视化)
        this.flashTake = false;           // take 动作闪烁标记
    }

    // 获取 (P操作 / Wait / Take)
    take(kernel, ticksToWait) {
        const task = kernel.currentTask;
        if (!task) return false;

        this.flashTake = false;
        if (this.count > 0) {
            this.count--;
            this.flashTake = true;
            kernel.log(`信号量[${this.name}]: ${task.name} 获取 (count=${this.count}/${this.maxCount})`);
            return true;
        } else {
            if (ticksToWait > 0) {
                this.waitingTasks.push(task);
                kernel.blockCurrentTask(`信号量[${this.name}]`, ticksToWait, this);
            }
            kernel.log(`信号量[${this.name}]: ${task.name} 等待 (count=0)`);
            return false;
        }
    }

    // 释放 (V操作 / Signal / Give)
    give(kernel) {
        this.flashGive = false;
        if (this.count < this.maxCount) {
            this.count++;
            this.flashGive = true;

            const giver = kernel.currentTask ? kernel.currentTask.name : 'ISR';
            kernel.log(`信号量[${this.name}]: ${giver} 释放 (count=${this.count}/${this.maxCount})`);

            // 唤醒等待任务 (count 会立刻被消费, 但 flashGive 保留供可视化)
            if (this.waitingTasks.length > 0 && this.count > 0) {
                this.count--;
                const next = this.waitingTasks.shift();
                kernel.unblockTask(next);
            }
            return true;
        }
        return false;
    }

    // 从 ISR 释放 (模拟)
    giveFromISR(kernel) {
        return this.give(kernel);
    }
}
