/**
 * RTOS Kernel Simulator
 * 模拟 FreeRTOS 风格的实时操作系统内核
 */

// ============ 任务状态 ============
const TaskState = {
    READY: 'ready',
    RUNNING: 'running',
    BLOCKED: 'blocked',
    SUSPENDED: 'suspended',
    DELETED: 'deleted'
};

// ============ 任务控制块 (TCB) ============
class TCB {
    static nextId = 0;

    constructor(name, priority, stackSize, taskFunc, color) {
        this.id = TCB.nextId++;
        this.name = name;
        this.priority = priority;         // 数值越大优先级越高 (0 = idle)
        this.basePriority = priority;     // 基础优先级 (用于优先级继承恢复)
        this.state = TaskState.READY;
        this.color = color || this._generateColor();

        // 栈相关
        this.stackSize = stackSize;
        this.stackUsed = 0;              // 当前栈使用量
        this.stackHighWaterMark = 0;     // 栈最高使用水位
        this.stackBase = 0;             // 栈基址 (由堆分配器设置)

        // 调度相关
        this.ticksRunning = 0;           // 已运行的总 tick 数
        this.timeSliceRemaining = 0;     // 同优先级时间片轮转剩余
        this.timeSliceMax = 5;           // 时间片大小

        // 阻塞相关
        this.blockReason = '';           // 阻塞原因
        this.blockTicksRemaining = 0;   // 阻塞剩余 tick
        this.waitingOn = null;           // 等待的 IPC 对象

        // 任务行为函数
        this.taskFunc = taskFunc;        // 每个 tick 调用的行为函数
        this.taskData = {};              // 任务私有数据

        // 链表指针 (模拟)
        this.next = null;
        this.prev = null;
    }

    _generateColor() {
        // 卡通风柔和色板
        const palette = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];
        return palette[this.id % palette.length];
    }
}

// ============ 就绪链表 (按优先级组织) ============
class ReadyList {
    constructor(maxPriority) {
        this.maxPriority = maxPriority;
        // 每个优先级一个链表
        this.lists = new Array(maxPriority + 1).fill(null).map(() => []);
        this.topReadyPriority = -1;
    }

    insert(tcb) {
        this.lists[tcb.priority].push(tcb);
        if (tcb.priority > this.topReadyPriority) {
            this.topReadyPriority = tcb.priority;
        }
    }

    remove(tcb) {
        const list = this.lists[tcb.priority];
        const idx = list.indexOf(tcb);
        if (idx !== -1) list.splice(idx, 1);
        this._recalcTop();
    }

    getHighest() {
        if (this.topReadyPriority < 0) return null;
        const list = this.lists[this.topReadyPriority];
        return list.length > 0 ? list[0] : null;
    }

    // 时间片轮转: 将当前最高优先级的第一个任务移到末尾
    rotate(priority) {
        const list = this.lists[priority];
        if (list.length > 1) {
            list.push(list.shift());
        }
    }

    _recalcTop() {
        this.topReadyPriority = -1;
        for (let i = this.maxPriority; i >= 0; i--) {
            if (this.lists[i].length > 0) {
                this.topReadyPriority = i;
                return;
            }
        }
    }

    getAllTasks() {
        const all = [];
        for (let i = this.maxPriority; i >= 0; i--) {
            for (const tcb of this.lists[i]) {
                all.push(tcb);
            }
        }
        return all;
    }
}

// ============ 内核调度器 ============
class Kernel {
    constructor() {
        this.tickCount = 0;
        this.maxPriority = 7;
        this.readyList = new ReadyList(this.maxPriority);
        this.allTasks = [];               // 所有任务 (TCB 链表)
        this.blockedTasks = [];           // 阻塞任务列表
        this.suspendedTasks = [];         // 挂起任务列表
        this.currentTask = null;          // 当前运行任务
        this.idleTask = null;             // 空闲任务
        this.running = false;
        this.eventLog = [];               // 事件日志
        this.timeline = [];               // 时间线记录 [{tick, taskName, taskColor}]
        this.contextSwitchCount = 0;

        // IPC objects
        this.queues = [];
        this.mutexes = [];
        this.semaphores = [];

        // Heap
        this.heap = null;

        // Callbacks for visualization
        this.onTick = null;
        this.onEvent = null;
    }

    // 创建任务
    createTask(name, priority, stackSize, taskFunc, color) {
        const tcb = new TCB(name, priority, stackSize, taskFunc, color);

        // 从堆分配栈空间
        if (this.heap) {
            const block = this.heap.malloc(stackSize, `${name}_stack`);
            if (block) {
                tcb.stackBase = block.address;
            }
        }

        // 加入全局任务链表
        this.allTasks.push(tcb);
        this._linkTCB(tcb);

        // 初始化时间片
        tcb.timeSliceRemaining = tcb.timeSliceMax;

        // 加入就绪队列
        tcb.state = TaskState.READY;
        this.readyList.insert(tcb);

        this.log(`任务创建: ${name} (优先级=${priority}, 栈=${stackSize}B)`);
        return tcb;
    }

    // 创建空闲任务
    createIdleTask() {
        this.idleTask = this.createTask('Idle', 0, 128, (task, kernel) => {
            // 空闲任务什么都不做
            task.stackUsed = Math.min(task.stackUsed + 2, 40);
        }, '#888');
    }

    // 模拟 TCB 链表链接
    _linkTCB(tcb) {
        if (this.allTasks.length <= 1) return;
        const prev = this.allTasks[this.allTasks.length - 2];
        prev.next = tcb;
        tcb.prev = prev;
        // 循环链表
        tcb.next = this.allTasks[0];
        this.allTasks[0].prev = tcb;
    }

    // 删除任务
    deleteTask(tcb) {
        tcb.state = TaskState.DELETED;
        this.readyList.remove(tcb);
        this.blockedTasks = this.blockedTasks.filter(t => t !== tcb);
        this.suspendedTasks = this.suspendedTasks.filter(t => t !== tcb);

        // 释放栈内存
        if (this.heap && tcb.stackBase) {
            this.heap.free(tcb.stackBase);
        }

        this.log(`任务删除: ${tcb.name}`);
    }

    // 挂起任务
    suspendTask(tcb) {
        if (tcb.state === TaskState.READY) {
            this.readyList.remove(tcb);
        } else if (tcb.state === TaskState.BLOCKED) {
            this.blockedTasks = this.blockedTasks.filter(t => t !== tcb);
        }
        tcb.state = TaskState.SUSPENDED;
        this.suspendedTasks.push(tcb);
        this.log(`任务挂起: ${tcb.name}`);

        if (tcb === this.currentTask) {
            this.currentTask = null;
            this._schedule();
        }
    }

    // 恢复任务
    resumeTask(tcb) {
        if (tcb.state !== TaskState.SUSPENDED) return;
        this.suspendedTasks = this.suspendedTasks.filter(t => t !== tcb);
        tcb.state = TaskState.READY;
        this.readyList.insert(tcb);
        this.log(`任务恢复: ${tcb.name}`);
    }

    // 阻塞当前任务
    blockCurrentTask(reason, ticks, waitObj) {
        if (!this.currentTask) return;
        const tcb = this.currentTask;
        this.readyList.remove(tcb);
        tcb.state = TaskState.BLOCKED;
        tcb.blockReason = reason;
        tcb.blockTicksRemaining = ticks;
        tcb.waitingOn = waitObj || null;
        this.blockedTasks.push(tcb);
        this.log(`任务阻塞: ${tcb.name} (原因: ${reason}, ${ticks} ticks)`);
        this.currentTask = null;
    }

    // 解除阻塞
    unblockTask(tcb) {
        if (tcb.state !== TaskState.BLOCKED) return;
        this.blockedTasks = this.blockedTasks.filter(t => t !== tcb);
        tcb.state = TaskState.READY;
        tcb.blockReason = '';
        tcb.blockTicksRemaining = 0;
        tcb.waitingOn = null;
        tcb.timeSliceRemaining = tcb.timeSliceMax;
        this.readyList.insert(tcb);
        this.log(`任务解除阻塞: ${tcb.name}`);
    }

    // ============ 调度器核心 ============
    _schedule() {
        const highest = this.readyList.getHighest();
        if (!highest) return;

        if (this.currentTask && this.currentTask.state === TaskState.RUNNING) {
            // 抢占检查
            if (highest.priority > this.currentTask.priority) {
                // 高优先级任务抢占
                this.log(`抢占: ${highest.name}(P${highest.priority}) 抢占 ${this.currentTask.name}(P${this.currentTask.priority})`);
                this.currentTask.state = TaskState.READY;
                this.currentTask.timeSliceRemaining = this.currentTask.timeSliceMax;
                this.readyList.insert(this.currentTask);
                this.currentTask = null;
            } else if (highest.priority === this.currentTask.priority &&
                       this.currentTask.timeSliceRemaining <= 0) {
                // 同优先级时间片到期 -> 轮转
                this.log(`时间片轮转: ${this.currentTask.name} -> ${highest.name}`);
                this.currentTask.state = TaskState.READY;
                this.currentTask.timeSliceRemaining = this.currentTask.timeSliceMax;
                this.readyList.insert(this.currentTask);
                this.readyList.rotate(this.currentTask.priority);
                this.currentTask = null;
            } else {
                return; // 当前任务继续运行
            }
        }

        // 选择最高优先级任务运行
        const next = this.readyList.getHighest();
        if (next) {
            this.readyList.remove(next);
            next.state = TaskState.RUNNING;
            if (this.currentTask !== next) {
                this.contextSwitchCount++;
            }
            this.currentTask = next;
        }
    }

    // ============ 系统 Tick ============
    tick() {
        this.tickCount++;

        // 1. 处理阻塞任务的超时
        const toUnblock = [];
        for (const tcb of this.blockedTasks) {
            if (tcb.blockTicksRemaining > 0) {
                tcb.blockTicksRemaining--;
                if (tcb.blockTicksRemaining <= 0) {
                    toUnblock.push(tcb);
                }
            }
        }
        for (const tcb of toUnblock) {
            this.unblockTask(tcb);
        }

        // 2. 当前任务时间片递减
        if (this.currentTask && this.currentTask.state === TaskState.RUNNING) {
            this.currentTask.timeSliceRemaining--;
            this.currentTask.ticksRunning++;
        }

        // 3. 调度
        this._schedule();

        // 4. 执行当前任务的行为函数
        if (this.currentTask && this.currentTask.taskFunc) {
            this.currentTask.taskFunc(this.currentTask, this);
            // 更新栈水位
            if (this.currentTask.stackUsed > this.currentTask.stackHighWaterMark) {
                this.currentTask.stackHighWaterMark = this.currentTask.stackUsed;
            }
        }

        // 5. 记录时间线
        this.timeline.push({
            tick: this.tickCount,
            taskName: this.currentTask ? this.currentTask.name : 'None',
            taskColor: this.currentTask ? this.currentTask.color : '#333',
            taskId: this.currentTask ? this.currentTask.id : -1
        });

        // 6. 回调
        if (this.onTick) this.onTick(this);
    }

    // 日志
    log(msg) {
        const entry = { tick: this.tickCount, msg };
        this.eventLog.push(entry);
        if (this.onEvent) this.onEvent(entry);
    }

    // 获取活跃任务 (非 DELETED)
    getActiveTasks() {
        return this.allTasks.filter(t => t.state !== TaskState.DELETED);
    }

    // 重置
    reset() {
        this.tickCount = 0;
        this.readyList = new ReadyList(this.maxPriority);
        this.allTasks = [];
        this.blockedTasks = [];
        this.suspendedTasks = [];
        this.currentTask = null;
        this.idleTask = null;
        this.running = false;
        this.eventLog = [];
        this.timeline = [];
        this.contextSwitchCount = 0;
        this.queues = [];
        this.mutexes = [];
        this.semaphores = [];
        TCB.nextId = 0;
        if (this.heap) this.heap.reset();
    }
}
