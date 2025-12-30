import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GameManager, CONFIG } from './core/GameManager.js';
import { SceneSetup } from './core/SceneSetup.js';
import { InputManager } from './core/InputManager.js';
import { UIManager } from './ui/UIManager.js';
import { Player } from './entities/Player.js';
import { KekkaiManager } from './entities/KekkaiManager.js';
import { EnemyManager } from './core/EnemyManager.js';

class Main {
    constructor() {
        this.gameManager = new GameManager();
        this.sceneSetup = new SceneSetup();

        const domElements = {
            stick: document.getElementById('stickZone'),
            knob: document.getElementById('stickKnob'),
            btnJump: document.getElementById('btnDown'),
            btnDist: document.getElementById('btnUp'),
            btnAct: document.getElementById('btnLeft'),
            btnDraw: document.getElementById('btnRight'),
            modeBtn: document.getElementById('modeSwitch')
        };
        this.inputManager = new InputManager(this.sceneSetup.renderer, this.sceneSetup.camera, domElements);

        this.controllers = [];
        this.setupVRControllers();
        this.inputManager.setControllers(this.controllers);

        this.player = new Player(this.sceneSetup.scene, this.sceneSetup.world, this.sceneSetup.camera, this.inputManager);
        this.player.init(this.sceneSetup.materials);

        this.uiManager = new UIManager(this.sceneSetup.renderer, this.sceneSetup.camera);

        this.kekkaiManager = new KekkaiManager(
            this.sceneSetup.scene,
            this.sceneSetup.world,
            this.sceneSetup.camera,
            this.player,
            this.inputManager
        );

        this.enemyManager = new EnemyManager(this.sceneSetup.scene, this.sceneSetup.world, this.player);

        this.gameManager.startWave();

        this.lastT = 0;
        this.sceneSetup.renderer.setAnimationLoop((t) => this.loop(t));

        const vrBtn = document.getElementById('vrBtn');
        vrBtn.addEventListener('click', async () => {
             if (navigator.xr) {
                 try {
                     const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
                     this.sceneSetup.renderer.xr.setSession(session);
                     document.querySelectorAll('.novr-only').forEach(e => e.style.opacity = 0);
                     session.addEventListener('end', () => {
                         document.querySelectorAll('.novr-only').forEach(e => e.style.opacity = 1);
                     });
                 } catch (e) {
                     alert("VR Error: " + e.message);
                 }
             }
        });
    }

    setupVRControllers() {
        const modelFactory = new XRControllerModelFactory();
        const playerGroup = this.sceneSetup.playerGroup;

        for (let i = 0; i < 2; i++) {
            const controller = this.sceneSetup.renderer.xr.getController(i);
            playerGroup.add(controller);
            this.controllers.push(controller);

            const grip = this.sceneSetup.renderer.xr.getControllerGrip(i);
            grip.add(modelFactory.createControllerModel(grip));
            playerGroup.add(grip);
            // We can store grips if needed, but InputManager uses controllers for position.
        }
    }

    loop(t) {
        const dt = Math.min((t - this.lastT) / 1000, 0.1);
        this.lastT = t;

        // SP Drain Logic
        let drain = this.kekkaiManager.kekkaiList.length * CONFIG.kekkai.spCostPerSec;
        // Check drawing state from InputManager (last frame's state or current?)
        // InputManager.inputState is updated in Player.update() -> input.update()
        // But we need it for regen BEFORE update? Or allow one frame lag?
        // Let's use current state.
        const inputState = this.inputManager.inputState;
        if ((inputState.vrLeft.drawing || inputState.vrRight.drawing || this.kekkaiManager.activePhysKekkai) && this.kekkaiManager.isPhysMode) {
            drain += CONFIG.kekkai.spCostPerSec;
        }
        // Regen/Drain
        // We pass 'drain' as active consumption (subtracted from regen)
        // ConsumeSp is for Instant costs. RegenSp handles over-time.
        this.gameManager.regenSp(dt, drain);

        this.sceneSetup.world.step(1/60, dt, 3);

        this.player.update(dt);

        // Input state is now fresh from Player.update()
        this.kekkaiManager.update(dt, this.inputManager.inputState);
        this.enemyManager.update(dt, t);

        this.sceneSetup.renderer.render(this.sceneSetup.scene, this.sceneSetup.camera);

        this.inputManager.postUpdate();
    }
}

new Main();
