/**
 * 主应用 - 场景配置、UI控制
 *
 * 场景设计原则 (与真实 RTOS 一致):
 *  - 高优先级任务必须周期性阻塞 (delay/等待IPC), 否则低优先级任务永远得不到 CPU
 *  - taskFunc 只在该任务是 currentTask 时才执行
 *  - 所有 IPC 操作 (take/give/send/receive) 必须在任务自己运行时调用
 *  - 使用 task.taskData 保存任务私有状态, 用确定性逻辑代替 Math.random
 */

let kernel, viz, timer;
let speed = 5;
let paused = true;

// ============ 场景定义 ============
const Scenarios = {

    // ==================== 基础调度 ====================
    basic: {
        name: '基础调度',
        desc: '三个不同优先级的任务。高优先级任务周期性 delay 阻塞自己, 中优先级才有机会跑; 中优先级也 delay, 低优先级才能跑。观察: 抢占发生在高优先级任务从阻塞恢复的瞬间。',
        setup(k) {
            k.createTask('High', 5, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 8, 180);
                // 运行 3 tick 后 delay 5 tick (模拟 vTaskDelay)
                if (task.taskData.runCount === undefined) task.taskData.runCount = 0;
                task.taskData.runCount++;
                if (task.taskData.runCount >= 3) {
                    task.taskData.runCount = 0;
                    kern.blockCurrentTask('vTaskDelay(5)', 5);
                }
            }, '#e53935');

            k.createTask('Medium', 3, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 5, 140);
                if (task.taskData.runCount === undefined) task.taskData.runCount = 0;
                task.taskData.runCount++;
                if (task.taskData.runCount >= 4) {
                    task.taskData.runCount = 0;
                    kern.blockCurrentTask('vTaskDelay(3)', 3);
                }
            }, '#FB8C00');

            k.createTask('Low', 1, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 3, 100);
                // 低优先级永远不主动阻塞, 只在别人都阻塞时才跑
            }, '#43A047');
        }
    },

    // ==================== 优先级抢占 + 时间片轮转 ====================
    priority: {
        name: '优先级抢占',
        desc: 'Critical(P7) 周期性触发, 立刻抢占一切。两个 Worker(P4) 同优先级, 用时间片轮转(Round-Robin)交替执行。Background(P1) 只在所有高优先级任务都阻塞时才跑。',
        setup(k) {
            k.createTask('Critical', 7, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 10, 200);
                // 运行 2 tick 就阻塞 (模拟中断处理完毕)
                if (task.taskData.runCount === undefined) task.taskData.runCount = 0;
                task.taskData.runCount++;
                if (task.taskData.runCount >= 2) {
                    task.taskData.runCount = 0;
                    kern.blockCurrentTask('等待下次中断', 8);
                }
            }, '#D32F2F');

            k.createTask('Worker_A', 4, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 4, 150);
                // 偶尔 delay 让 Background 有机会
                if (task.taskData.runCount === undefined) task.taskData.runCount = 0;
                task.taskData.runCount++;
                if (task.taskData.runCount >= 12) {
                    task.taskData.runCount = 0;
                    kern.blockCurrentTask('vTaskDelay(3)', 3);
                }
            }, '#1976D2');

            k.createTask('Worker_B', 4, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 4, 130);
                if (task.taskData.runCount === undefined) task.taskData.runCount = 0;
                task.taskData.runCount++;
                if (task.taskData.runCount >= 12) {
                    task.taskData.runCount = 0;
                    kern.blockCurrentTask('vTaskDelay(3)', 3);
                }
            }, '#7B1FA2');

            k.createTask('Background', 1, 128, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 2, 60);
            }, '#455A64');
        }
    },

    // ==================== 互斥量与优先级反转 ====================
    mutex: {
        name: '互斥量与优先级反转',
        desc: '经典优先级反转: HighPri(P6) 一开始阻塞等待事件。LowPri(P2) 趁机获取互斥量并持有较久。当 HighPri 醒来尝试获取互斥量时被阻塞 → 优先级继承: LowPri 提升到 P6, 抢占 MedPri(P4), 尽快释放互斥量。',
        setup(k) {
            const mtx = new Mutex('SharedRes');
            k.mutexes.push(mtx);

            // HighPri: 一开始阻塞, 醒来后尝试获取互斥量
            k.createTask('HighPri', 6, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 6, 160);

                // 状态机
                if (task.taskData.phase === undefined) {
                    // 初始: 立刻阻塞, 模拟等待外部事件
                    task.taskData.phase = 'waiting';
                    kern.blockCurrentTask('等待外部事件', 8);
                    return;
                }

                if (task.taskData.phase === 'waiting') {
                    // 醒来后, 尝试获取互斥量
                    task.taskData.phase = 'acquiring';
                    if (mtx.take(kern, 30)) {
                        task.taskData.phase = 'holding';
                        task.taskData.holdCount = 0;
                    }
                    // 如果 take 失败, 会被阻塞, 下次醒来继续
                    return;
                }

                if (task.taskData.phase === 'acquiring') {
                    // 从互斥量等待中醒来, 再试一次
                    if (mtx.take(kern, 30)) {
                        task.taskData.phase = 'holding';
                        task.taskData.holdCount = 0;
                    }
                    return;
                }

                if (task.taskData.phase === 'holding') {
                    task.taskData.holdCount++;
                    if (task.taskData.holdCount >= 3) {
                        mtx.give(kern);
                        task.taskData.phase = 'done';
                        task.taskData.doneCount = 0;
                    }
                    return;
                }

                if (task.taskData.phase === 'done') {
                    task.taskData.doneCount++;
                    if (task.taskData.doneCount >= 2) {
                        // 循环: 再次进入等待
                        task.taskData.phase = 'waiting';
                        kern.blockCurrentTask('等待外部事件', 10);
                    }
                }
            }, '#E53935');

            // MedPri: 持续运行, 不需要互斥量, 是优先级反转的"夹层"
            k.createTask('MedPri', 4, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 4, 120);
                // 偶尔 delay 让低优先级跑
                if (task.taskData.runCount === undefined) task.taskData.runCount = 0;
                task.taskData.runCount++;
                if (task.taskData.runCount >= 20) {
                    task.taskData.runCount = 0;
                    kern.blockCurrentTask('vTaskDelay(2)', 2);
                }
            }, '#FB8C00');

            // LowPri: 开局获取互斥量, 持有较长时间
            k.createTask('LowPri', 2, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 3, 100);

                if (task.taskData.phase === undefined) {
                    task.taskData.phase = 'acquire';
                }

                if (task.taskData.phase === 'acquire') {
                    if (mtx.take(kern, 50)) {
                        task.taskData.phase = 'holding';
                        task.taskData.holdCount = 0;
                        kern.log('★ LowPri 获取了互斥量, 将持有较长时间');
                    }
                    return;
                }

                if (task.taskData.phase === 'holding') {
                    task.taskData.holdCount++;
                    if (task.taskData.holdCount >= 6) {
                        mtx.give(kern);
                        task.taskData.phase = 'released';
                        task.taskData.restCount = 0;
                        kern.log('★ LowPri 释放互斥量');
                    }
                    return;
                }

                if (task.taskData.phase === 'released') {
                    task.taskData.restCount++;
                    if (task.taskData.restCount >= 5) {
                        task.taskData.phase = 'acquire'; // 循环
                    }
                }
            }, '#43A047');
        }
    },

    // ==================== 二值信号量同步 ====================
    semaphore: {
        name: '二值信号量同步',
        desc: '二值信号量(count 0/1): Producer 周期性 give(count→1) 通知 Consumer。Consumer 阻塞 take 等待(count→0)后运行。本质是事件通知机制, 常用于 ISR→Task 模式。',
        setup(k) {
            const eventSem = new Semaphore('Event', 1, 0);
            k.semaphores.push(eventSem);

            // Producer: 周期性 give 事件信号量, 然后 delay
            k.createTask('Producer', 5, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 5, 150);
                if (task.taskData.runCount === undefined) task.taskData.runCount = 0;
                task.taskData.runCount++;

                if (task.taskData.runCount === 2) {
                    eventSem.give(kern);
                    kern.log('Producer: give → count=1, 通知 Consumer');
                }
                if (task.taskData.runCount >= 3) {
                    task.taskData.runCount = 0;
                    kern.blockCurrentTask('vTaskDelay(6)', 6);
                }
            }, '#E53935');

            // Consumer: 循环 take 等待事件
            k.createTask('Consumer', 4, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 4, 120);
                if (task.taskData.phase === undefined) task.taskData.phase = 'wait';

                if (task.taskData.phase === 'wait') {
                    eventSem.take(kern, 20);
                    task.taskData.phase = 'process';
                    task.taskData.processCount = 0;
                    return;
                }
                if (task.taskData.phase === 'process') {
                    task.taskData.processCount++;
                    if (task.taskData.processCount >= 2) {
                        kern.log('Consumer: 处理完毕, 继续等待');
                        task.taskData.phase = 'wait';
                    }
                }
            }, '#1976D2');

            // Background 任务, 让调度更真实
            k.createTask('Background', 2, 128, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 2, 60);
            }, '#455A64');
        }
    },

    // ==================== 计数信号量 ====================
    counting_sem: {
        name: '计数信号量',
        desc: '连接池场景: 计数信号量(max=3, 初始=3)管理 3 个数据库连接。5 个 Worker 竞争使用连接, 同一时刻最多 3 个 Worker 持有连接, 其余被阻塞在等待队列中。观察 count 值变化和任务阻塞/唤醒。',
        setup(k) {
            const poolSem = new Semaphore('ConnPool', 3, 3);
            k.semaphores.push(poolSem);

            const colors = ['#E53935', '#1976D2', '#43A047', '#7B1FA2', '#00897B'];
            for (let i = 0; i < 5; i++) {
                k.createTask(`Worker${i}`, 4 - Math.floor(i / 2), 192, (task, kern) => {
                    task.stackUsed = Math.min(task.stackUsed + 3, 110);
                    if (task.taskData.phase === undefined) task.taskData.phase = 'idle';

                    if (task.taskData.phase === 'idle') {
                        task.taskData.idleCount = (task.taskData.idleCount || 0) + 1;
                        // 错开请求时间, 让竞争逐步发生
                        if (task.taskData.idleCount >= 2 + i) {
                            task.taskData.idleCount = 0;
                            task.taskData.phase = 'acquire';
                        }
                        return;
                    }

                    if (task.taskData.phase === 'acquire') {
                        if (poolSem.take(kern, 20)) {
                            task.taskData.phase = 'using';
                            task.taskData.useCount = 0;
                            kern.log(`${task.name}: 获取连接 (剩余=${poolSem.count}/${poolSem.maxCount})`);
                        }
                        // take 失败会被阻塞, 被唤醒后再次进入此分支
                        return;
                    }

                    if (task.taskData.phase === 'using') {
                        task.taskData.useCount++;
                        // 每个 Worker 使用连接时长不同, 模拟真实负载差异
                        const holdTime = 3 + (i % 3);
                        if (task.taskData.useCount >= holdTime) {
                            poolSem.give(kern);
                            kern.log(`${task.name}: 归还连接 (剩余=${poolSem.count}/${poolSem.maxCount})`);
                            task.taskData.phase = 'cooldown';
                            task.taskData.coolCount = 0;
                        }
                        return;
                    }

                    if (task.taskData.phase === 'cooldown') {
                        task.taskData.coolCount++;
                        if (task.taskData.coolCount >= 3) {
                            task.taskData.phase = 'idle';
                        }
                    }
                }, colors[i]);
            }
        }
    },

    // ==================== 消息队列通信 ====================
    queue: {
        name: '消息队列通信',
        desc: 'Sensor(P5) 周期采集数据放入 SensorData 队列, 然后 delay 等待下次采样。Process(P4) 从队列取数据处理。CmdSend(P3) 发送命令到 Commands 队列, CmdRecv(P2) 接收并执行。队列满/空时观察任务阻塞。',
        setup(k) {
            const sensorQ = new MessageQueue('SensorData', 4, 4);
            const cmdQ = new MessageQueue('Commands', 3, 4);
            k.queues.push(sensorQ);
            k.queues.push(cmdQ);

            let sensorSeq = 0;
            let cmdSeq = 0;

            // Sensor: 采集→发送→delay
            k.createTask('Sensor', 5, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 6, 160);
                if (task.taskData.phase === undefined) task.taskData.phase = 'sample';

                if (task.taskData.phase === 'sample') {
                    sensorSeq++;
                    const data = `S${sensorSeq}`;
                    sensorQ.send(kern, data, 5);
                    task.taskData.phase = 'delay';
                    return;
                }
                if (task.taskData.phase === 'delay') {
                    task.taskData.phase = 'sample';
                    kern.blockCurrentTask('采样间隔', 4);
                }
            }, '#E53935');

            // Process: 循环从队列取数据
            k.createTask('Process', 4, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 5, 140);
                if (task.taskData.phase === undefined) task.taskData.phase = 'recv';

                if (task.taskData.phase === 'recv') {
                    const data = sensorQ.receive(kern, 10);
                    if (data) {
                        task.taskData.lastData = data;
                        task.taskData.phase = 'process';
                        task.taskData.processCount = 0;
                    }
                    return;
                }
                if (task.taskData.phase === 'process') {
                    task.taskData.processCount++;
                    if (task.taskData.processCount >= 2) {
                        kern.log(`Process: 处理完成 [${task.taskData.lastData}]`);
                        task.taskData.phase = 'recv';
                    }
                }
            }, '#1976D2');

            // CmdSend: 周期发送命令
            k.createTask('CmdSend', 3, 192, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 4, 100);
                if (task.taskData.phase === undefined) task.taskData.phase = 'idle';

                if (task.taskData.phase === 'idle') {
                    task.taskData.idleCount = (task.taskData.idleCount || 0) + 1;
                    if (task.taskData.idleCount >= 5) {
                        task.taskData.idleCount = 0;
                        task.taskData.phase = 'send';
                    }
                    return;
                }
                if (task.taskData.phase === 'send') {
                    cmdSeq++;
                    const cmds = ['START', 'STOP', 'RESET', 'READ'];
                    cmdQ.send(kern, cmds[cmdSeq % cmds.length], 5);
                    task.taskData.phase = 'idle';
                }
            }, '#7B1FA2');

            // CmdRecv: 循环接收命令
            k.createTask('CmdRecv', 2, 192, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 3, 80);
                const data = cmdQ.receive(kern, 15);
                if (data) {
                    kern.log(`CmdRecv: 收到命令 [${data}]`);
                }
            }, '#00897B');
        }
    },

    // ==================== 堆内存分配 ====================
    heap: {
        name: '堆内存分配',
        desc: 'Allocator(P5) 周期性 malloc 不同大小的内存块, 持有一段时间后 free。TempAlloc(P3) 快速 malloc→free 模拟临时缓冲区。观察: 堆碎片化、空闲块合并、水位线变化。',
        setup(k) {
            let allocSeq = 0;

            k.createTask('Allocator', 5, 128, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 4, 80);
                if (!task.taskData.allocs) task.taskData.allocs = [];
                if (task.taskData.phase === undefined) task.taskData.phase = 'alloc';

                if (task.taskData.phase === 'alloc') {
                    allocSeq++;
                    const sizes = [32, 64, 48, 96, 80, 128, 40, 72];
                    const size = sizes[allocSeq % sizes.length];
                    const block = kern.heap.malloc(size, `blk_${allocSeq}`);
                    if (block) {
                        task.taskData.allocs.push(block.address);
                    }
                    task.taskData.phase = 'wait';
                    task.taskData.waitCount = 0;
                    return;
                }
                if (task.taskData.phase === 'wait') {
                    task.taskData.waitCount++;
                    if (task.taskData.waitCount >= 3) {
                        task.taskData.phase = 'free';
                    }
                    // delay 让其他任务跑
                    kern.blockCurrentTask('vTaskDelay(2)', 2);
                    return;
                }
                if (task.taskData.phase === 'free') {
                    if (task.taskData.allocs.length > 3) {
                        const addr = task.taskData.allocs.shift();
                        kern.heap.free(addr);
                    }
                    task.taskData.phase = 'alloc';
                }
            }, '#E53935');

            let tmpSeq = 0;
            k.createTask('TempAlloc', 3, 128, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 3, 60);
                if (task.taskData.phase === undefined) task.taskData.phase = 'alloc';

                if (task.taskData.phase === 'alloc') {
                    tmpSeq++;
                    const size = 16 + (tmpSeq * 13 % 48);
                    const block = kern.heap.malloc(size, `tmp_${tmpSeq}`);
                    if (block) task.taskData.pendingFree = block.address;
                    task.taskData.phase = 'hold';
                    return;
                }
                if (task.taskData.phase === 'hold') {
                    // 下一 tick 立刻释放
                    if (task.taskData.pendingFree) {
                        kern.heap.free(task.taskData.pendingFree);
                        task.taskData.pendingFree = null;
                    }
                    task.taskData.phase = 'rest';
                    task.taskData.restCount = 0;
                    return;
                }
                if (task.taskData.phase === 'rest') {
                    task.taskData.restCount++;
                    if (task.taskData.restCount >= 3) {
                        task.taskData.phase = 'alloc';
                    }
                }
            }, '#1976D2');

            k.createTask('Monitor', 2, 128, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 2, 50);
                // 纯监控, 偶尔跑一下
            }, '#43A047');
        }
    },

    // ==================== 综合演示 ====================
    full: {
        name: '综合演示',
        desc: 'ISR(P7)→信号量→Handler(P5)→队列→Consumer(P4)完整事件链。ResTask(P3)用互斥量保护共享资源。MemMgr(P2)做动态内存管理。所有机制同时工作。',
        setup(k) {
            const dataQ = new MessageQueue('DataQ', 4, 4);
            const mtx = new Mutex('SharedRes');
            const sem = new Semaphore('ISR_Sync', 1, 0);
            k.queues.push(dataQ);
            k.mutexes.push(mtx);
            k.semaphores.push(sem);

            let dataSeq = 0;

            // ISR 模拟 (P7): 快速触发信号量, 立刻阻塞回去
            k.createTask('ISR_Sim', 7, 128, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 8, 100);
                // 每次醒来就 give 信号量, 然后立刻阻塞
                sem.give(kern);
                kern.log('ISR: 触发中断, give 信号量');
                kern.blockCurrentTask('等待下次中断', 10);
            }, '#D32F2F');

            // Handler (P5): 等信号量 → 发数据到队列 → 再等
            k.createTask('Handler', 5, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 6, 180);
                if (task.taskData.phase === undefined) task.taskData.phase = 'wait';

                if (task.taskData.phase === 'wait') {
                    sem.take(kern, 20);
                    task.taskData.phase = 'send';
                    return;
                }
                if (task.taskData.phase === 'send') {
                    dataSeq++;
                    dataQ.send(kern, `V${dataSeq}`, 5);
                    task.taskData.phase = 'cooldown';
                    task.taskData.coolCount = 0;
                    return;
                }
                if (task.taskData.phase === 'cooldown') {
                    task.taskData.coolCount++;
                    if (task.taskData.coolCount >= 2) {
                        task.taskData.phase = 'wait';
                    }
                }
            }, '#E53935');

            // Consumer (P4): 从队列取数据处理
            k.createTask('Consumer', 4, 256, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 5, 150);
                if (task.taskData.phase === undefined) task.taskData.phase = 'recv';

                if (task.taskData.phase === 'recv') {
                    const data = dataQ.receive(kern, 12);
                    if (data) {
                        kern.log(`Consumer: 收到 [${data}]`);
                        task.taskData.phase = 'process';
                        task.taskData.processCount = 0;
                    }
                    return;
                }
                if (task.taskData.phase === 'process') {
                    task.taskData.processCount++;
                    if (task.taskData.processCount >= 2) {
                        task.taskData.phase = 'recv';
                    }
                }
            }, '#1976D2');

            // ResTask (P3): 用互斥量保护共享资源
            k.createTask('ResTask', 3, 192, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 4, 120);
                if (task.taskData.phase === undefined) task.taskData.phase = 'idle';

                if (task.taskData.phase === 'idle') {
                    task.taskData.idleCount = (task.taskData.idleCount || 0) + 1;
                    if (task.taskData.idleCount >= 4) {
                        task.taskData.idleCount = 0;
                        task.taskData.phase = 'acquire';
                    }
                    return;
                }
                if (task.taskData.phase === 'acquire') {
                    if (mtx.take(kern, 10)) {
                        task.taskData.phase = 'critical';
                        task.taskData.critCount = 0;
                    }
                    return;
                }
                if (task.taskData.phase === 'critical') {
                    task.taskData.critCount++;
                    if (task.taskData.critCount >= 3) {
                        mtx.give(kern);
                        task.taskData.phase = 'idle';
                    }
                }
            }, '#7B1FA2');

            // MemMgr (P2): 动态内存管理
            let memSeq = 0;
            k.createTask('MemMgr', 2, 192, (task, kern) => {
                task.stackUsed = Math.min(task.stackUsed + 3, 80);
                if (!task.taskData.allocs) task.taskData.allocs = [];
                if (task.taskData.phase === undefined) task.taskData.phase = 'alloc';

                if (task.taskData.phase === 'alloc') {
                    memSeq++;
                    const blk = kern.heap.malloc(64, `mem_${memSeq}`);
                    if (blk) task.taskData.allocs.push(blk.address);
                    task.taskData.phase = 'idle';
                    task.taskData.idleCount = 0;
                    return;
                }
                if (task.taskData.phase === 'idle') {
                    task.taskData.idleCount++;
                    if (task.taskData.idleCount >= 6) {
                        if (task.taskData.allocs.length > 2) {
                            kern.heap.free(task.taskData.allocs.shift());
                        }
                        task.taskData.phase = 'alloc';
                    }
                }
            }, '#00897B');
        }
    }
};

// ============ 初始化 ============
function init() {
    kernel = new Kernel();
    kernel.heap = new HeapManager(4096);
    viz = new Visualizer(kernel);

    // 绑定控件
    document.getElementById('btn-start').addEventListener('click', start);
    document.getElementById('btn-pause').addEventListener('click', pause);
    document.getElementById('btn-back').addEventListener('click', backstep);
    document.getElementById('btn-step').addEventListener('click', step);
    document.getElementById('btn-reset').addEventListener('click', reset);
    document.getElementById('speed-slider').addEventListener('input', (e) => {
        speed = parseInt(e.target.value);
        if (!paused) {
            clearInterval(timer);
            timer = setInterval(doTick, getInterval());
        }
    });

    // 场景按钮
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const scenario = btn.dataset.scenario;
            loadScenario(scenario);
            document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 默认加载基础场景
    loadScenario('basic');
    document.querySelector('[data-scenario="basic"]').classList.add('active');
}

function getInterval() {
    // speed 1=2秒/tick, 5=500ms/tick, 10=50ms/tick
    if (speed <= 3) return 2000 - (speed - 1) * 500;  // 2000, 1500, 1000
    if (speed <= 6) return 1000 - (speed - 3) * 166;   // 834, 668, 502
    return 500 - (speed - 6) * 100;                     // 400, 300, 200, 100
}

function loadScenario(name) {
    pause();
    kernel.reset();
    kernel.heap = new HeapManager(4096);

    const scenario = Scenarios[name];
    if (!scenario) return;

    document.getElementById('scenario-desc').textContent = scenario.desc;
    kernel.createIdleTask();
    scenario.setup(kernel);
    viz.refresh();
}

function start() {
    if (!paused) return;
    paused = false;
    timer = setInterval(doTick, getInterval());
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-pause').disabled = false;
}

function pause() {
    paused = true;
    if (timer) clearInterval(timer);
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-pause').disabled = false;
}

function step() {
    pause();
    doTick();
}

// 后撤: 重置场景并重放到 (当前tick - 1)
function backstep() {
    pause();
    const targetTick = kernel.tickCount - 1;
    if (targetTick < 0) return;

    const activeBtn = document.querySelector('.scenario-btn.active');
    const scenarioName = activeBtn ? activeBtn.dataset.scenario : 'basic';

    kernel.reset();
    kernel.heap = new HeapManager(4096);
    const scenario = Scenarios[scenarioName];
    if (!scenario) return;
    kernel.createIdleTask();
    scenario.setup(kernel);

    for (let i = 0; i < targetTick; i++) {
        kernel.tick();
    }
    viz.refresh();
}

function reset() {
    pause();
    const activeBtn = document.querySelector('.scenario-btn.active');
    const scenario = activeBtn ? activeBtn.dataset.scenario : 'basic';
    loadScenario(scenario);
}

function doTick() {
    kernel.tick();
    viz.refresh();
}

// 自适应 canvas 大小
function resizeCanvases() {
    ['canvas-timeline', 'canvas-heap'].forEach(id => {
        const c = document.getElementById(id);
        if (c) {
            const parent = c.parentElement;
            c.width = parent.clientWidth - 16;
            c.height = parent.clientHeight - 30;
        }
    });
}

window.addEventListener('resize', () => {
    resizeCanvases();
    if (viz) viz.refresh();
});

document.addEventListener('DOMContentLoaded', () => {
    resizeCanvases();
    init();
});
