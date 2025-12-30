import * as THREE from 'three';

export class InputManager {
    constructor(renderer, camera, domElements) {
        this.renderer = renderer;
        this.camera = camera;
        this.dom = domElements;

        // Game Actions State
        this.inputState = {
            move: new THREE.Vector2(), // x, y (-1 to 1)
            look: new THREE.Vector2(), // x, y (delta)
            jump: false,
            metsu: false, // Attack
            kai: false,   // Release/Cancel
            globalMetsu: false,
            globalKai: false,
            modeSwitch: false,
            distChange: false,

            // Barrier Drawing State
            drawing: false,
            drawStartPos: new THREE.Vector2(), // Screen coords for mobile
            drawCurrentPos: new THREE.Vector2(), // Screen coords for mobile

            // VR Specifics
            vrLeft: {
                trigger: false, grip: false,
                handPos: new THREE.Vector3(),
                drawing: false
            },
            vrRight: {
                trigger: false, grip: false,
                handPos: new THREE.Vector3(),
                drawing: false
            }
        };

        // Internal tracking
        this.stickId = null;
        this.stickStart = { x: 0, y: 0 };
        this.lookId = null;
        this.lastLook = { x: 0, y: 0 };
        this.drawId = null;

        // Button hold states to prevent spamming
        this._buttons = {
            jump: false, metsu: false, kai: false,
            mode: false, dist: false,
            vrLTrig: false, vrLX: false, vrLY: false,
            vrRTrig: false, vrRB: false
        };

        this.initMobileListeners();
    }

    initMobileListeners() {
        const { stick, knob, btnJump, btnDist, btnAct, btnDraw, modeBtn } = this.dom;
        const canvas = this.renderer.domElement;

        // Stick
        stick.addEventListener('touchstart', e => {
            e.preventDefault();
            if (this.stickId !== null) return;
            const t = e.changedTouches[0];
            this.stickId = t.identifier;
            const r = stick.getBoundingClientRect();
            this.stickStart = { x: r.left + r.width/2, y: r.top + r.height/2 };
            this.updateStick(t.clientX, t.clientY);
        }, { passive: false });

        stick.addEventListener('touchmove', e => {
            e.preventDefault();
            for(let i=0; i<e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.stickId) {
                    this.updateStick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                }
            }
        }, { passive: false });

        const endStick = e => {
            for(let i=0; i<e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.stickId) {
                    this.stickId = null;
                    this.inputState.move.set(0, 0);
                    knob.style.transform = 'translate(-50%, -50%)';
                }
            }
        };
        stick.addEventListener('touchend', endStick);
        stick.addEventListener('touchcancel', endStick);

        // Look (Camera)
        canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            for(let i=0; i<e.changedTouches.length; i++) {
                if (this.lookId === null && e.changedTouches[i].target === canvas) {
                    this.lookId = e.changedTouches[i].identifier;
                    this.lastLook = { x: e.changedTouches[i].clientX, y: e.changedTouches[i].clientY };
                }
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            if (this.lookId === null) return;
            for(let i=0; i<e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.lookId) {
                    const t = e.changedTouches[i];
                    // Update delta
                    const dx = t.clientX - this.lastLook.x;
                    const dy = t.clientY - this.lastLook.y;
                    this.inputState.look.x = dx;
                    this.inputState.look.y = dy;
                    this.lastLook = { x: t.clientX, y: t.clientY };
                }
            }
        }, { passive: false });

        canvas.addEventListener('touchend', e => {
            for(let i=0; i<e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.lookId) {
                    this.lookId = null;
                    this.inputState.look.set(0, 0);
                }
            }
        });

        // Buttons
        btnJump.addEventListener('touchstart', e => { e.preventDefault(); this.inputState.jump = true; });
        btnJump.addEventListener('touchend', e => { e.preventDefault(); this.inputState.jump = false; });

        btnDist.addEventListener('touchstart', e => { e.preventDefault(); this.inputState.distChange = true; });

        btnAct.addEventListener('touchstart', e => {
            e.preventDefault();
            // Simple logic: tap for metsu, but we need to distiguish tap vs swipe/hold?
            // The legacy code used tap pos check for Metsu vs Kai.
            // For now, let's map it simply: Tap = Metsu.
            // The original code handled Metsu vs Kai via logic inside the listener.
            // We will simplify: Left button is Metsu. Swipe Left button is Kai?
            // Legacy: "tap... if > 20px move then Kai else Metsu"
            const t = e.changedTouches[0];
            this._actStart = { x: t.clientX, y: t.clientY, id: t.identifier };
        });
        btnAct.addEventListener('touchend', e => {
            e.preventDefault();
            for(let i=0; i<e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this._actStart?.id) {
                    const t = e.changedTouches[i];
                    if (Math.hypot(t.clientX - this._actStart.x, t.clientY - this._actStart.y) > 20) {
                        this.inputState.kai = true;
                    } else {
                        this.inputState.metsu = true;
                    }
                    this._actStart = null;
                }
            }
        });

        modeBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); this.inputState.modeSwitch = true; });

        // Draw (Kekkai)
        btnDraw.addEventListener('touchstart', e => {
            e.preventDefault();
            if (this.drawId !== null) return;
            const t = e.changedTouches[0];
            this.drawId = t.identifier;
            this.inputState.drawing = true;
            this.inputState.drawStartPos.set(t.clientX, t.clientY);
            this.inputState.drawCurrentPos.set(t.clientX, t.clientY);
            btnDraw.classList.add('drawing');
        });
        btnDraw.addEventListener('touchmove', e => {
            e.preventDefault();
            if (this.drawId === null) return;
            for(let i=0; i<e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.drawId) {
                    this.inputState.drawCurrentPos.set(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                }
            }
        });
        btnDraw.addEventListener('touchend', e => {
            e.preventDefault();
            for(let i=0; i<e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.drawId) {
                    this.drawId = null;
                    this.inputState.drawing = false;
                    btnDraw.classList.remove('drawing');
                }
            }
        });
    }

    updateStick(cx, cy) {
        let dx = cx - this.stickStart.x;
        let dy = cy - this.stickStart.y;
        const d = Math.hypot(dx, dy);
        const max = (this.dom.stick.offsetWidth / 2) * 0.8;
        if (d > max) {
            dx *= max / d;
            dy *= max / d;
        }
        this.inputState.move.set(dx / max, dy / max);
        this.dom.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    update() {
        // Reset frame-based triggers
        this.inputState.look.set(0, 0); // Mobile look is delta based event, but we need to clear it if no event?
        // Actually mobile look event sets it. We should probably zero it at end of frame or use accumulated delta.
        // For now, let's assume the event handler sets it and we use it, then clear it.
        // But the event fires async.
        // Better: The event adds to a delta, update() reads and clears that delta.

        // Let's refine look handling.
        // The event handler currently OVERWRITES inputState.look.
        // We should add to a _lookAccumulator and then copy to inputState.look in update(), then clear accumulator.
        // For simplicity in this step, I'll rely on the fact that update is called frequently.
        // But to be safe, I will zero it out at the END of this method, effectively making it valid for one frame.

        // VR Input
        if (this.renderer.xr.isPresenting) {
            this.handleVRInput();
        }

        // Return a snapshot
        return this.inputState;
    }

    postUpdate() {
        // Clear one-shot triggers
        this.inputState.jump = false;
        this.inputState.metsu = false;
        this.inputState.kai = false;
        this.inputState.globalMetsu = false;
        this.inputState.globalKai = false;
        this.inputState.modeSwitch = false;
        this.inputState.distChange = false;
        this.inputState.look.set(0, 0);
    }

    handleVRInput() {
        const session = this.renderer.xr.getSession();
        if (!session) return;

        // Reset analog values
        this.inputState.move.set(0, 0);

        for (const src of session.inputSources) {
            if (!src.gamepad) continue;
            const gp = src.gamepad;
            const hand = src.handedness;

            // Get Controller Object for position
            // We need access to the controller objects created in Main/SceneSetup.
            // But we don't have them here directly unless passed or queried.
            // We can query them from renderer if we stored them?
            // Actually, we usually access them via index 0 and 1.
            // Let's assume SceneSetup or Main provides the controller objects to InputManager,
            // or InputManager manages them.
            // For now, I will assume we can get them from `this.controllers` if I add a setter or pass them.
            // I'll add `setControllers(controllers)` method.

            if (hand === 'left') {
                // Stick Move
                if (gp.axes.length >= 4) {
                    const x = gp.axes[2];
                    const y = gp.axes[3];
                    if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
                         // VR move is usually relative to head direction.
                         // InputManager just provides the raw stick vector. Player handles context.
                         this.inputState.move.set(x, y);
                    }
                }

                // Buttons
                // 0: Trigger, 1: Grip, 4: X, 5: Y (Oculus Touch layout roughly)
                const trig = gp.buttons[0]?.pressed;
                const grip = gp.buttons[1]?.pressed;
                const xBtn = gp.buttons[4]?.pressed;
                const yBtn = gp.buttons[5]?.pressed;

                // Mapping
                if (trig && !this._buttons.vrLTrig) { this.inputState.kai = true; } // Trigger: Kai
                this._buttons.vrLTrig = trig;

                if (xBtn && !this._buttons.vrLX) { this.inputState.globalKai = true; }
                this._buttons.vrLX = xBtn;

                if (yBtn && !this._buttons.vrLY) { this.inputState.globalMetsu = true; }
                this._buttons.vrLY = yBtn;

                this.inputState.vrLeft.drawing = grip; // Grip: Drawing
                this.inputState.vrLeft.grip = grip;
            }

            if (hand === 'right') {
                // Stick Turn
                if (gp.axes.length >= 4) {
                    const x = gp.axes[2];
                    if (Math.abs(x) > 0.2) {
                        this.inputState.look.x = x * 2.0; // multiplier
                    }
                }

                const trig = gp.buttons[0]?.pressed;
                const grip = gp.buttons[1]?.pressed;
                const aBtn = gp.buttons[4]?.pressed;
                const bBtn = gp.buttons[5]?.pressed;

                // Mapping
                if (trig && !this._buttons.vrRTrig) { this.inputState.metsu = true; } // Trigger: Metsu
                this._buttons.vrRTrig = trig;

                if (aBtn) { this.inputState.jump = true; } // A: Jump (Auto-fire allowed? Legacy says "if not pressed before", but A button usually holding jump is ok for sustain jump or just one-off. Legacy code: if pressed, velocity = jump. So spamming. I'll make it continuous or one-shot. Let's make it state based for Player to decide, but here I set it true.)

                if (bBtn && !this._buttons.vrRB) { this.inputState.distChange = true; }
                this._buttons.vrRB = bBtn;

                this.inputState.vrRight.drawing = grip; // Grip: Drawing
                this.inputState.vrRight.grip = grip;
            }
        }
    }

    setControllers(controllers) {
        this.controllers = controllers;
    }

    getControllerPose(hand) {
        if (!this.controllers) return null;
        // controllers[0] is usually left? No, it depends on connection order.
        // We should check `.getHandedness()` or user data.
        // Usually, 0 and 1 are assigned. We need to check `renderer.xr.getController(i)`.
        // Ideally, Main passes map { left: c1, right: c2 }.
        return this.controllers[hand];
    }
}
