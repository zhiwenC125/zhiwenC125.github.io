/**
 * 可视化引擎 — 看板式 TCB 卡片 + 队列容器
 *
 * 核心理念: 每个 TCB 是一张卡片，它在不同"容器"之间移动:
 *   - CPU 运行槽 (只能放 1 张)
 *   - 就绪列表 (按优先级分层)
 *   - 阻塞列表
 *   - 挂起列表
 *   - IPC 等待队列 (每个 Mutex/Semaphore/Queue 都有自己的等待列表)
 */

class Visualizer {
    constructor(kernel) {
        this.kernel = kernel;
        // 缓存上一次每个 TCB 所在容器 id, 用于做动画
        this.prevSlots = {};
    }

    // ======================== TCB 卡片 ========================
    _createCard(tcb) {
        const card = document.createElement('div');
        card.className = 'tcb-card';
        card.dataset.taskId = tcb.id;
        card.style.borderColor = tcb.color;
        card.style.setProperty('--task-color', tcb.color);

        // 判断是否刚从别的容器移过来 → 加入动画
        const prevSlot = this.prevSlots[tcb.id];
        const curSlot = this._getSlotId(tcb);
        if (prevSlot && prevSlot !== curSlot) {
            card.classList.add('card-enter');
        }
        this.prevSlots[tcb.id] = curSlot;

        // 优先级标签色
        const priBadge = tcb.priority >= 6 ? 'pri-critical'
                       : tcb.priority >= 4 ? 'pri-high'
                       : tcb.priority >= 2 ? 'pri-medium'
                       : 'pri-low';

        // 栈使用百分比
        const stackPct = tcb.stackSize > 0 ? Math.round(tcb.stackUsed / tcb.stackSize * 100) : 0;

        // 阻塞原因
        const blockInfo = tcb.state === TaskState.BLOCKED
            ? `<div class="card-block-reason">${tcb.blockReason} (${tcb.blockTicksRemaining}T)</div>`
            : '';

        // 时间片 (仅就绪/运行态有意义)
        const sliceInfo = (tcb.state === TaskState.RUNNING || tcb.state === TaskState.READY)
            ? `<span class="card-slice">片:${tcb.timeSliceRemaining}</span>`
            : '';

        card.innerHTML = `
            <div class="card-top">
                <span class="card-name" style="color:${tcb.color}">${tcb.name}</span>
                <span class="card-pri ${priBadge}">P${tcb.priority}</span>
            </div>
            <div class="card-body">
                <span class="card-id">ID:${tcb.id}</span>
                <span class="card-ticks">运行:${tcb.ticksRunning}T</span>
                ${sliceInfo}
            </div>
            <div class="card-stack">
                <div class="card-stack-bar">
                    <div class="card-stack-fill" style="width:${stackPct}%; background:${tcb.color}"></div>
                </div>
                <span class="card-stack-text">栈 ${tcb.stackUsed}/${tcb.stackSize}B</span>
            </div>
            ${blockInfo}
        `;

        // tooltip
        card.title = `${tcb.name}\n优先级: ${tcb.priority} (基础:${tcb.basePriority})\n状态: ${tcb.state}\n栈: ${tcb.stackUsed}/${tcb.stackSize}B (水位:${tcb.stackHighWaterMark}B)\n已运行: ${tcb.ticksRunning} ticks`;

        return card;
    }

    // 判断 TCB 当前应该在哪个容器
    _getSlotId(tcb) {
        if (tcb.state === TaskState.RUNNING) return 'slot-running';
        if (tcb.state === TaskState.SUSPENDED) return 'slot-suspended';
        if (tcb.state === TaskState.BLOCKED) {
            // 如果在某个 IPC 对象的等待队列中, 放到对应 IPC 容器
            if (tcb.waitingOn) {
                if (tcb.waitingOn instanceof Mutex) return `ipc-mutex-${tcb.waitingOn.name}`;
                if (tcb.waitingOn instanceof Semaphore) return `ipc-sem-${tcb.waitingOn.name}`;
                if (tcb.waitingOn instanceof MessageQueue) return `ipc-queue-${tcb.waitingOn.name}`;
            }
            return 'slot-blocked';
        }
        return 'slot-ready';
    }

    // ======================== 主调度看板 ========================
    drawBoard() {
        const tasks = this.kernel.getActiveTasks();

        // --- CPU 运行槽 ---
        const runSlot = document.getElementById('slot-running');
        runSlot.innerHTML = '';
        if (this.kernel.currentTask) {
            runSlot.appendChild(this._createCard(this.kernel.currentTask));
        } else {
            runSlot.innerHTML = '<div class="slot-empty">空闲</div>';
        }

        // --- 就绪列表 (按优先级分层) ---
        const readySlot = document.getElementById('slot-ready');
        readySlot.innerHTML = '';
        const rl = this.kernel.readyList;
        let hasAny = false;
        for (let p = this.kernel.maxPriority; p >= 0; p--) {
            const list = rl.lists[p];
            if (list.length === 0) continue;
            hasAny = true;

            const layer = document.createElement('div');
            layer.className = 'ready-layer';

            const label = document.createElement('div');
            label.className = 'ready-layer-label';
            label.textContent = `优先级 ${p}`;
            layer.appendChild(label);

            const chain = document.createElement('div');
            chain.className = 'ready-chain';
            list.forEach((tcb, i) => {
                chain.appendChild(this._createCard(tcb));
                if (i < list.length - 1) {
                    const arrow = document.createElement('div');
                    arrow.className = 'chain-arrow';
                    arrow.textContent = '→';
                    chain.appendChild(arrow);
                }
            });
            // 循环标记
            if (list.length > 1) {
                const loop = document.createElement('div');
                loop.className = 'chain-loop-hint';
                loop.textContent = '↻ 轮转';
                chain.appendChild(loop);
            }
            layer.appendChild(chain);
            readySlot.appendChild(layer);
        }
        if (!hasAny) {
            readySlot.innerHTML = '<div class="slot-empty">就绪列表为空</div>';
        }

        // --- 阻塞列表 (不在 IPC 等待队列中的) ---
        const blockedSlot = document.getElementById('slot-blocked');
        blockedSlot.innerHTML = '';
        const plainBlocked = this.kernel.blockedTasks.filter(t => !t.waitingOn);
        if (plainBlocked.length > 0) {
            plainBlocked.forEach(tcb => {
                blockedSlot.appendChild(this._createCard(tcb));
            });
        } else {
            blockedSlot.innerHTML = '<div class="slot-empty">无阻塞任务</div>';
        }

        // --- 挂起列表 ---
        const suspSlot = document.getElementById('slot-suspended');
        suspSlot.innerHTML = '';
        if (this.kernel.suspendedTasks.length > 0) {
            this.kernel.suspendedTasks.forEach(tcb => {
                suspSlot.appendChild(this._createCard(tcb));
            });
        } else {
            suspSlot.innerHTML = '<div class="slot-empty">无挂起任务</div>';
        }
    }

    // ======================== IPC 容器看板 ========================
    drawIPCBoard() {
        const board = document.getElementById('ipc-board');
        board.innerHTML = '';

        // 消息队列
        for (const q of this.kernel.queues) {
            board.appendChild(this._createQueueContainer(q));
        }
        // 互斥量
        for (const m of this.kernel.mutexes) {
            board.appendChild(this._createMutexContainer(m));
        }
        // 信号量
        for (const s of this.kernel.semaphores) {
            board.appendChild(this._createSemaphoreContainer(s));
        }

        if (this.kernel.queues.length === 0 && this.kernel.mutexes.length === 0 && this.kernel.semaphores.length === 0) {
            board.innerHTML = '<div class="slot-empty" style="grid-column:1/-1">当前场景无 IPC 对象</div>';
        }
    }

    _createQueueContainer(q) {
        const container = document.createElement('div');
        container.className = 'ipc-container ipc-queue-type';
        container.id = `ipc-queue-${q.name}`;

        // 队列数据槽
        const slots = [];
        for (let i = 0; i < q.maxLength; i++) {
            const filled = i < q.items.length;
            slots.push(`<div class="q-slot ${filled ? 'q-filled' : ''}">${filled ? q.items[i] : ''}</div>`);
        }

        // 等待接收的任务
        const waitRecvCards = q.waitingToReceive.map(t => this._createCard(t).outerHTML).join('');
        const waitSendCards = q.waitingToSend.map(t => this._createCard(t).outerHTML).join('');

        container.innerHTML = `
            <div class="ipc-header ipc-header-queue">📨 消息队列: ${q.name}</div>
            <div class="ipc-data">
                <div class="ipc-data-label">队列数据 (${q.items.length}/${q.maxLength}):</div>
                <div class="q-slots">${slots.join('<span class="q-arrow-in">→</span>')}</div>
            </div>
            <div class="ipc-wait-section">
                <div class="ipc-wait-label">等待接收 (阻塞中):</div>
                <div class="ipc-wait-cards">${waitRecvCards || '<span class="slot-empty-sm">无</span>'}</div>
            </div>
            <div class="ipc-wait-section">
                <div class="ipc-wait-label">等待发送 (队列满):</div>
                <div class="ipc-wait-cards">${waitSendCards || '<span class="slot-empty-sm">无</span>'}</div>
            </div>
        `;
        return container;
    }

    _createMutexContainer(m) {
        const container = document.createElement('div');
        container.className = 'ipc-container ipc-mutex-type';
        container.id = `ipc-mutex-${m.name}`;

        const lockIcon = m.locked ? '🔒' : '🔓';
        const ownerCard = m.owner ? this._createCard(m.owner).outerHTML : '<span class="slot-empty-sm">无持有者</span>';
        const waitCards = m.waitingTasks.map(t => this._createCard(t).outerHTML).join('');

        // 优先级继承高亮
        const inheritInfo = m.owner && m.owner.priority !== m.owner.basePriority
            ? `<div class="inherit-badge">优先级继承! P${m.owner.basePriority} → P${m.owner.priority}</div>`
            : '';

        container.innerHTML = `
            <div class="ipc-header ipc-header-mutex">${lockIcon} 互斥量: ${m.name}</div>
            ${inheritInfo}
            <div class="ipc-owner-section">
                <div class="ipc-wait-label">持有者 (Owner):</div>
                <div class="ipc-wait-cards">${ownerCard}</div>
            </div>
            <div class="ipc-wait-section">
                <div class="ipc-wait-label">等待队列 (被阻塞):</div>
                <div class="ipc-wait-cards">${waitCards || '<span class="slot-empty-sm">无等待任务</span>'}</div>
            </div>
        `;
        return container;
    }

    _createSemaphoreContainer(s) {
        const container = document.createElement('div');
        container.className = 'ipc-container ipc-sem-type';
        container.id = `ipc-sem-${s.name}`;

        const typeStr = s.maxCount === 1 ? '二值信号量' : '计数信号量';

        // 显示实际 count, 但如果本 tick 发生了 give 且被立刻消费 (count 回到 0),
        // 用 flashGive 标记让用户看到"信号量曾经亮过"
        const displayCount = s.count;
        const wasGiven = s.flashGive;   // 本 tick 有 give 动作
        const wasTaken = s.flashTake;   // 本 tick 有 take 动作

        const dots = [];
        for (let i = 0; i < s.maxCount; i++) {
            if (i < displayCount) {
                dots.push(`<span class="sem-dot sem-available"></span>`);
            } else if (i === displayCount && wasGiven) {
                // count 被立刻消费了, 但用闪烁动画表示"信号穿过"
                dots.push(`<span class="sem-dot sem-flash"></span>`);
            } else {
                dots.push(`<span class="sem-dot sem-taken"></span>`);
            }
        }

        // 动作提示
        const actionHint = wasGiven
            ? '<span class="sem-action sem-action-give">⚡ Give!</span>'
            : wasTaken
            ? '<span class="sem-action sem-action-take">✋ Take</span>'
            : '';

        const waitCards = s.waitingTasks.map(t => this._createCard(t).outerHTML).join('');

        container.innerHTML = `
            <div class="ipc-header ipc-header-sem">🚦 ${typeStr}: ${s.name} ${actionHint}</div>
            <div class="ipc-data">
                <div class="ipc-data-label">计数: ${displayCount}/${s.maxCount}${wasGiven && displayCount === 0 ? ' (信号已穿过→唤醒等待者)' : ''}</div>
                <div class="sem-dots">${dots.join('')}</div>
            </div>
            <div class="ipc-wait-section">
                <div class="ipc-wait-label">等待队列 (Take 阻塞):</div>
                <div class="ipc-wait-cards">${waitCards || '<span class="slot-empty-sm">无等待任务</span>'}</div>
            </div>
        `;

        // 清除闪烁标记 (下一次 refresh 不再显示)
        s.flashGive = false;
        s.flashTake = false;
        return container;
    }

    // ======================== 堆内存可视化 ========================
    drawHeap(canvasId, statsId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const heap = this.kernel.heap;
        if (!heap) return;

        const blocks = heap.getBlocksOrdered();
        const totalSize = heap.totalSize;
        const barY = 20, barH = 60;

        ctx.fillStyle = '#475569';
        ctx.font = '12px Nunito, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`堆: ${totalSize} 字节`, 10, 14);

        for (const block of blocks) {
            const x = (block.address / totalSize) * (W - 20) + 10;
            const w = Math.max(2, (block.size / totalSize) * (W - 20));

            if (block.free) {
                ctx.fillStyle = '#dcfce7';
                ctx.strokeStyle = '#22c55e';
            } else {
                const hash = this._hashStr(block.label);
                ctx.fillStyle = `hsl(${hash % 360}, 65%, 85%)`;
                ctx.strokeStyle = `hsl(${hash % 360}, 55%, 55%)`;
            }
            // 圆角矩形
            this._roundRect(ctx, x, barY, w, barH, 6);
            ctx.fill();
            ctx.lineWidth = 2;
            this._roundRect(ctx, x, barY, w, barH, 6);
            ctx.stroke();

            if (w > 35) {
                ctx.fillStyle = '#334155';
                ctx.font = '600 10px Nunito, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(block.free ? '空闲' : block.label, x + w / 2, barY + barH / 2 - 4);
                ctx.fillStyle = '#64748b';
                ctx.font = '9px Nunito, sans-serif';
                ctx.fillText(`${block.size}B`, x + w / 2, barY + barH / 2 + 10);
            }
        }

        // 地址标尺
        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        for (let a = 0; a <= totalSize; a += totalSize / 8) {
            const x = (a / totalSize) * (W - 20) + 10;
            ctx.fillText(`0x${Math.floor(a).toString(16)}`, x, barY + barH + 14);
        }

        const statsEl = document.getElementById(statsId);
        if (statsEl) {
            const s = heap.getStats();
            statsEl.innerHTML = `已用:${s.used}B | 空闲:${s.free}B | 碎片:${s.fragmentation}% | 最低水位:${s.minEverFree}B`;
        }
    }

    _hashStr(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
        return Math.abs(h);
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ======================== 任务栈 ========================
    drawStacks(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        const tasks = this.kernel.getActiveTasks();
        for (const t of tasks) {
            const pct = t.stackSize > 0 ? (t.stackUsed / t.stackSize * 100) : 0;
            const hwm = t.stackSize > 0 ? (t.stackHighWaterMark / t.stackSize * 100) : 0;
            const danger = pct > 80;

            const div = document.createElement('div');
            div.className = 'stack-item';
            div.innerHTML = `
                <div class="stack-label" style="color:${t.color}">${t.name}</div>
                <div class="stack-bar-bg">
                    <div class="stack-bar-fill ${danger ? 'stack-danger' : ''}" style="height:${pct}%; background:${t.color}"></div>
                    <div class="stack-hwm" style="bottom:${hwm}%"></div>
                </div>
                <div class="stack-info">${t.stackUsed}/${t.stackSize}</div>
            `;
            container.appendChild(div);
        }
    }

    // ======================== 甘特图 ========================
    drawTimeline(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const timeline = this.kernel.timeline;
        if (timeline.length === 0) return;

        const tasks = this.kernel.getActiveTasks();
        const names = [...new Set(tasks.map(t => t.name))];
        const rowH = Math.min(18, (H - 20) / Math.max(names.length, 1));
        const start = Math.max(0, timeline.length - 100);
        const vis = timeline.slice(start);
        const colW = Math.min(6, (W - 55) / Math.max(vis.length, 1));

        ctx.fillStyle = '#475569';
        ctx.font = '600 10px Nunito, sans-serif';
        ctx.textAlign = 'right';
        names.forEach((n, i) => ctx.fillText(n, 50, 14 + i * rowH + rowH / 2 + 3));

        vis.forEach((e, col) => {
            const row = names.indexOf(e.taskName);
            if (row === -1) return;
            ctx.fillStyle = e.taskColor;
            const rx = 55 + col * colW, ry = 14 + row * rowH + 1;
            const rw = colW - 1, rh = rowH - 2;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, 2) : ctx.rect(rx, ry, rw, rh);
            ctx.fill();
        });

        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        for (let i = 0; i < vis.length; i += 15) {
            ctx.fillText(vis[i].tick, 55 + i * colW, H - 2);
        }
    }

    // ======================== 日志 ========================
    updateLog(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const recent = this.kernel.eventLog.slice(-40);
        container.innerHTML = recent.map(e =>
            `<div class="log-entry"><span class="log-tick">[T${e.tick}]</span> ${e.msg}</div>`
        ).join('');
        container.scrollTop = container.scrollHeight;
    }

    // ======================== 全部刷新 ========================
    refresh() {
        this.drawBoard();
        this.drawIPCBoard();
        this.drawHeap('canvas-heap', 'heap-stats');
        this.drawStacks('viz-stacks');
        this.drawTimeline('canvas-timeline');
        this.updateLog('event-log');

        const el = document.getElementById('tick-counter');
        if (el) el.textContent = `Tick: ${this.kernel.tickCount} | 切换: ${this.kernel.contextSwitchCount}`;
    }
}
