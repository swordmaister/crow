export const CONFIG = {
  VERSION: "v1.0 Refactored",
  colors: {
    sky: 0x87CEEB, ground: 0xC2B280,
    kekkai: 0xffff00, ghost: 0x00ffff,
    drawPhys: 0xffff00, drawGhost: 0x00ffff,
    highlight: 0xff0044,
    marker: 0xff0000,
    wall: 0xa0a0a0, building: 0xf0f0f0, pool: 0x88cccc,
    enemy: 0xff4444, giant: 0x880000, target: 0xFFD700, item: 0x00ff00, vip: 0x0000ff,
    wood: 0x8B4513, leaf: 0x228B22, iron: 0x333333, concrete: 0xaaaaaa,
    floater_high: 0xffffee, floater_low: 0xff8800, jumper: 0x00ff88
  },
  player: { speed: 10.0, jump: 22.0, height: 1.7, maxHp: 100, maxSp: 100 },
  kekkai: { sensitivity: 300.0, spCostPerSec: 1.0, spRegen: 5.0, metsuCost: 1.0 },
  dist: { near: 6.0, far: 20.0 },
  aimAssist: { baseRadius: 1.5 },
  field: { width: 120, depth: 160 }
};

export class GameManager {
    constructor() {
        if (GameManager.instance) return GameManager.instance;
        GameManager.instance = this;

        this.state = {
            wave: 1,
            kills: 0,
            req: 10, // Kills required
            nextSpawn: 0,
            playerHp: 100,
            playerSp: 100,
            missionType: 'normal',
            enemiesToSpawn: 0,
            isVipMode: false,
            vipHp: 100,
            isGameOver: false
        };

        this.eventListeners = {};
    }

    reset() {
        this.state.wave = 1;
        this.state.kills = 0;
        this.state.playerHp = 100;
        this.state.playerSp = 100;
        this.state.isGameOver = false;
        this.startWave();
    }

    on(event, callback) {
        if (!this.eventListeners[event]) this.eventListeners[event] = [];
        this.eventListeners[event].push(callback);
    }

    emit(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(cb => cb(data));
        }
    }

    startWave() {
        this.state.req = 10;
        this.state.enemiesToSpawn = 0;
        this.state.isVipMode = false;

        const typeIdx = (this.state.wave - 1) % 4;

        if (typeIdx === 0) {
            this.state.missionType = 'normal';
        } else if (typeIdx === 1) {
            this.state.missionType = 'annihilation';
            this.state.enemiesToSpawn = 10;
        } else if (typeIdx === 2) {
            this.state.missionType = 'hunt';
            this.state.req = 1; // 1 target
        } else {
            this.state.missionType = 'vip';
            this.state.isVipMode = true;
            this.state.vipHp = 100;
            this.emit('spawnVip');
        }

        this.emit('waveStart', this.state);
        this.emit('message', { text: `WAVE ${this.state.wave} START`, color: "#fff" });
    }

    checkClearCondition(enemyType, isEscape) {
        if (this.state.isGameOver) return;

        let progress = false;
        if (this.state.missionType === 'hunt') {
            if (enemyType === 'target') {
                this.state.req = 0;
                progress = true;
            }
        } else if (this.state.missionType === 'vip') {
             // Vip mode clear is handled by Vip reaching goal, not kills.
             // But killing enemies helps.
        } else {
            if (this.state.req > 0 && !isEscape) { // Escaped enemies don't count for normal quota usually?
                // Legacy code: "if progress && gameState.req <= 0"
                // Legacy killEnemy: "if (gameState.missionType === 'hunt' ... else if (gameState.req > 0) gameState.req--;"
                // Even escapes count? Legacy: "killEnemy(e, true)" is called on escape.
                // In Legacy, `killEnemy(e, true)` -> `if(!isEscape) ...`
                // Then `if (progress...)`.
                // Wait, if `isEscape` is true, does it decrement `req`?
                // Legacy: `killEnemy` is called. It checks `isTarget`. Then checks `req > 0`.
                // It does NOT check `!isEscape` before decrementing `req`.
                // So escaping enemies counted as progress in legacy 'normal' mode?
                // Actually, let's look at legacy:
                /*
                   if (gameState.missionType === 'hunt') { ... }
                   else { if (gameState.req > 0) { gameState.req--; progress = true; } }
                */
                // Yes, `killEnemy` decrements `req` regardless of `isEscape`.
                // EXCEPT: In 'annihilation' mode, escape calls `killEnemy(e, true)` with msg "Enemy Escaped (Defeated)".
                // In normal mode escape simply calls removeEnemy? No.
                // Legacy: `if (isOut) { ... if(annihilation) killEnemy(e, true); else ... removeEnemy(e); return; }`
                // So in normal mode, escape does NOT count.

                if (!isEscape) {
                    this.state.req--;
                    progress = true;
                }
            }
        }

        if (progress && this.state.req <= 0) {
            this.levelClear();
        }

        this.emit('hudUpdate');
    }

    levelClear() {
        this.emit('message', { text: `WAVE ${this.state.wave} CLEAR`, color: "#fe0" });
        this.emit('waveClear');
        setTimeout(() => {
            this.state.wave++;
            this.startWave();
        }, 2000);
    }

    vipReachedGoal() {
        this.state.req = 0;
        this.emit('message', { text: "護衛成功!", color: "#0f0" });
        this.levelClear();
    }

    vipDied() {
        this.emit('message', { text: "護衛失敗...", color: "#f00" });
        this.state.isVipMode = false;
        // Legacy code didn't game over, just removed VIP and maybe continued?
        // Legacy: "vip.hp <= 0 ... showMsg... removeBody... vip=null"
        // It seems it just fails the bonus or something? Or maybe it gets stuck if you need to clear?
        // Actually legacy doesn't reset wave on VIP death. It just continues.
        // But the mission is "Protect". If fails, what happens?
        // "Game Over" condition in Spec says "No Game Over".
        // But practically, if req is not met...
        // In legacy, `gameState.req` is 10 initially. VIP mission calls `startVipMission`.
        // If VIP dies, `req` is still whatever it was (10). You can still clear by killing 10 enemies?
        // Legacy `startWave` for VIP: `gameState.missionType = 'vip'; startVipMission();`.
        // `gameState.req` defaults to 10 at start of `startWave`.
        // So yes, you can fallback to killing 10 enemies.
    }

    takeDamage(amount) {
        this.state.playerHp = Math.max(0, this.state.playerHp - amount);
        this.emit('damage', amount);
        this.emit('hudUpdate');
        if (this.state.playerHp <= 0) {
             this.emit('message', { text: "WARNING: HP CRITICAL", color: "#f00" });
             // Spec says: "HP 0 -> Warning only, continue."
        }
    }

    heal(amount) {
        this.state.playerHp = Math.min(CONFIG.player.maxHp, this.state.playerHp + amount);
        this.emit('message', { text: "RECOVER!", color: "#0f0" });
        this.emit('hudUpdate');
    }

    consumeSp(amount) {
        if (this.state.playerSp >= amount) {
            this.state.playerSp -= amount;
            this.emit('hudUpdate');
            return true;
        }
        this.emit('message', { text: "霊力不足", color: "#f00" });
        return false;
    }

    regenSp(dt, activeDrain) {
        this.state.playerSp = Math.min(CONFIG.player.maxSp, this.state.playerSp + CONFIG.kekkai.spRegen * dt);
        this.state.playerSp -= activeDrain * dt;
        if (this.state.playerSp <= 0) {
            this.state.playerSp = 0;
            this.emit('spDepleted');
        }
        this.emit('hudUpdate');
    }
}
