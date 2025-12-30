import * as THREE from 'three';
import { CONFIG, GameManager } from '../core/GameManager.js';

export class UIManager {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.gameManager = GameManager.instance;

        // DOM Elements
        this.dom = {
            hud: document.getElementById('hud'),
            hpText: document.getElementById('hpText'),
            hpBar: document.getElementById('hpBar'),
            spText: document.getElementById('spText'),
            spBar: document.getElementById('spBar'),
            wVal: document.getElementById('waveVal'),
            tVal: document.getElementById('targetVal'),
            missionText: document.getElementById('missionText'),
            msg: document.getElementById('flashMsg'),
            vipBox: document.getElementById('vipBox'),
            vipHpBar: document.getElementById('vipHpBar'),
            version: document.getElementById('versionText'),
            novr: document.querySelectorAll('.novr-only'),

            // Mobile Controls
            distLabel: document.getElementById('distLabel'),
            modeSwitch: document.getElementById('modeSwitch'),
            btnDraw: document.getElementById('btnDraw')
        };

        if (this.dom.version) this.dom.version.textContent = CONFIG.VERSION;

        // VR HUD
        this.vrHudCtx = null;
        this.vrHudMesh = null;
        this.initVRHud();

        // Bind events
        this.gameManager.on('hudUpdate', () => this.update());
        this.gameManager.on('message', (data) => this.showMessage(data.text, data.color));
        this.gameManager.on('waveStart', () => this.updateMissionInfo());
        this.gameManager.on('waveClear', () => {}); // Handled by message
        this.gameManager.on('controlUpdate', (data) => this.updateControls(data.isPhys, data.dist));
    }

    initVRHud() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        this.vrHudCtx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        this.vrHudMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.0, 0.25),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthTest: false })
        );
        this.vrHudMesh.position.set(0, 0.3, -1);
        this.vrHudMesh.renderOrder = 9999;
        this.camera.add(this.vrHudMesh);
    }

    update() {
        const s = this.gameManager.state;

        // Mobile HUD
        this.dom.hpText.textContent = Math.floor(s.playerHp);
        this.dom.hpBar.style.width = (s.playerHp / CONFIG.player.maxHp * 100) + "%";
        this.dom.hpBar.style.backgroundColor = s.playerHp < 30 ? "#f00" : "#0f0";

        this.dom.spText.textContent = Math.floor(s.playerSp);
        this.dom.spBar.style.width = (s.playerSp / CONFIG.player.maxSp * 100) + "%";
        this.dom.spBar.style.backgroundColor = s.playerSp < 20 ? "#f00" : "#00bfff";

        this.dom.wVal.textContent = "WAVE " + s.wave;
        this.dom.tVal.textContent = s.req > 0 ? s.req : "CLEAR!";

        if (s.isVipMode) {
            this.dom.vipBox.style.display = "block";
            this.dom.vipHpBar.style.width = s.vipHp + "%";
        } else {
            this.dom.vipBox.style.display = "none";
        }

        // VR HUD
        if (this.renderer.xr.isPresenting && this.vrHudCtx) {
            this.renderVRHud(s);
        }
    }

    updateMissionInfo() {
        const type = this.gameManager.state.missionType;
        let text = "通常ミッション";
        if (type === 'annihilation') text = "殲滅戦 (逃亡許すな)";
        else if (type === 'hunt') text = "討伐戦 (金色の敵を倒せ)";
        else if (type === 'vip') text = "護衛任務";
        this.dom.missionText.textContent = text;
        this.update();
    }

    showMessage(text, color) {
        this.dom.msg.textContent = text;
        this.dom.msg.style.color = color;
        this.dom.msg.style.opacity = 1;
        setTimeout(() => this.dom.msg.style.opacity = 0, 500);
    }

    renderVRHud(s) {
        const ctx = this.vrHudCtx;
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = "rgba(0, 20, 40, 0.6)";
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, 508, 124);

        ctx.font = "bold 24px sans-serif";
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText(`WAVE ${s.wave}`, 20, 30);

        let mName = "通常";
        if(s.missionType==='annihilation') mName="殲滅戦";
        else if(s.missionType==='hunt') mName="討伐戦";
        else if(s.missionType==='vip') mName="護衛";

        ctx.font = "20px sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillText(mName + ": 残 " + (s.req > 0 ? s.req : "OK"), 20, 60);

        ctx.fillStyle = s.playerHp < 30 ? "#f55" : "#0f0";
        ctx.fillText(`HP: ${Math.floor(s.playerHp)}`, 300, 30);
        ctx.fillStyle = "#555"; ctx.fillRect(300, 35, 180, 15);
        ctx.fillStyle = s.playerHp < 30 ? "#f00" : "#0f0";
        ctx.fillRect(300, 35, 180 * (s.playerHp / CONFIG.player.maxHp), 15);

        ctx.fillStyle = "#0ff";
        ctx.fillText(`SP: ${Math.floor(s.playerSp)}`, 300, 75);
        ctx.fillStyle = "#555"; ctx.fillRect(300, 80, 180, 15);
        ctx.fillStyle = s.playerSp < 20 ? "#f00" : "#00bfff";
        ctx.fillRect(300, 80, 180 * (s.playerSp / CONFIG.player.maxSp), 15);

        if (s.isVipMode) {
            ctx.fillStyle = "#0ff";
            ctx.fillText(`VIP: ${s.vipHp}%`, 20, 100);
        }

        this.vrHudMesh.material.map.needsUpdate = true;
    }

    updateControls(isPhysMode, dist) {
        this.dom.modeSwitch.textContent = isPhysMode ? "モード: 顕現" : "モード: 幽体";
        this.dom.modeSwitch.className = isPhysMode ? "phys" : "ghost";
        this.dom.btnDraw.style.background = isPhysMode ? "linear-gradient(135deg, #FFD700, #FF8C00)" : "linear-gradient(135deg, #03a9f4, #0288d1)";
        this.dom.btnDraw.innerHTML = isPhysMode ? "顕<br><span style='font-size:10px'>Hold</span>" : "結<br><span style='font-size:10px'>Hold</span>";

        this.dom.distLabel.textContent = (dist === CONFIG.dist.near) ? "近" : "遠";
        this.showMessage(`射程: ${this.dom.distLabel.textContent}`, "#fff");

        if (isPhysMode) this.showMessage("物理顕現モード", "#fff");
        else this.showMessage("幽体結界モード", "#fff");
    }
}
