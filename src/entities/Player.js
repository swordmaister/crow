import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG, GameManager } from '../core/GameManager.js';

export class Player {
    constructor(scene, world, camera, inputManager) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.input = inputManager;
        this.gameManager = GameManager.instance;

        this.group = new THREE.Group();
        this.scene.add(this.group);
        // Camera is already added to playerGroup in SceneSetup?
        // Wait, SceneSetup created a playerGroup and added camera to it.
        // We should attach to that group or use it.
        // Let's assume SceneSetup passed the playerGroup via camera.parent?
        if (camera.parent && camera.parent.type === 'Group') {
            this.group = camera.parent;
        } else {
            this.group.add(camera);
        }

        // Physics Body
        const mat = world.materials ? world.materials.ply : new CANNON.Material('ply');
        // Note: SceneSetup stores materials in `this.materials`. We need access.
        // The `world` object itself doesn't store our custom `materials` dictionary.
        // We can pass `sceneSetup` to Player constructor or just assume `materials` property if we attach it to world (hacky).
        // Or finding it by name? Cannon doesn't search by name easily.
        // Let's assume `world.materials` is NOT available unless we hack it.
        // Better: Pass `sceneSetup` instance or materials map.
        // I will update the constructor signature in Main to pass SceneSetup or Materials.
        // For now, I'll try to find it or create new (which might break contact materials).
        // Actually, if I create a new Material('ply'), it is NOT the same object as in SceneSetup, so ContactMaterial won't work.
        // Critical: Must share Material instances.

        // Fix: I will access a global or pass it.
        // Since I can't easily change previous file without rewrite, I will assume Main passes `materials`.
    }

    // Adjusted init to accept materials
    init(materials) {
        this.materials = materials;

        this.body = new CANNON.Body({
            mass: 70,
            shape: new CANNON.Sphere(0.6),
            material: this.materials.ply,
            fixedRotation: true,
            linearDamping: 0.9
        });
        this.body.position.set(0, 5, 30);
        this.world.addBody(this.body);

        this.body.addEventListener('collide', (e) => {
             // Logic for taking damage from enemies
             // legacy: if (e.body && e.body.material && e.body.material.name === 'ene')
             // In Cannon-es, body.material is the material object.
             // We named them string in constructor new CANNON.Material('ene').
             // So .name property exists.
             if (e.body && e.body.material && e.body.material.name === 'ene') {
                 const relVel = e.contact.getImpactVelocityAlongNormal();
                 if (Math.abs(relVel) > 2.0) {
                     const dmg = Math.floor(Math.abs(relVel) * 2);
                     this.gameManager.takeDamage(dmg);

                     const normal = new CANNON.Vec3();
                     e.contact.ni.negate(normal);
                     this.body.applyImpulse(normal.scale(50 * Math.abs(relVel)), this.body.position);
                 }
             }
        });

        this.camAngle = { yaw: 0, pitch: 0 };
    }

    update(dt) {
        const inputState = this.input.update();

        // SP Regen
        // Determine active drain
        // We need to know if drawing. InputManager has drawing state.
        // Also if activePhysKekkai exists (handled in KekkaiManager).
        // We'll let KekkaiManager report drain, or GameManager handle it via callbacks?
        // Legacy: `updateSP` checks `vrState.drawing` etc.
        // We will move SP logic to GameManager, but Player should probably trigger it?
        // No, GameManager can run independently or be updated by Main.

        // Movement
        if (this.input.renderer.xr.isPresenting) {
            // VR Mode
            // Position is handled by Headset tracking for Camera.
            // Body follows camera?
            // Legacy: `playerGroup.position.copy(playerBody.position).add(0, height, 0)`
            // `playerGroup.rotation.y = camAngle.yaw` (Snap turn)

            // Apply Velocity from Stick
            // InputState.move is Vector2
            const dir = new THREE.Vector3();
            this.camera.getWorldDirection(dir);
            dir.y = 0; dir.normalize();

            const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
            // Wait, cross(dir, up) is right? Yes.

            const move = inputState.move; // x, y
            if (Math.abs(move.x) > 0.1 || Math.abs(move.y) > 0.1) {
                // move.y is usually forward/back (-1 is fwd? gamepad standard: -1 is up/fwd).
                // move.x is left/right.
                // Legacy: `moveVec = _vecDir * -stickY + _vecRight * -stickX`
                // My input manager returns raw axes.
                // Let's assume standard gamepad: Y axis -1 is up (forward). X axis 1 is right.
                // So: Fwd = -y, Right = x.

                const fwdVec = dir.clone().multiplyScalar(-move.y);
                const rightVec = right.clone().multiplyScalar(move.x);

                const finalVec = fwdVec.add(rightVec).normalize().multiplyScalar(CONFIG.player.speed);
                this.body.velocity.x = finalVec.x;
                this.body.velocity.z = finalVec.z;
            } else {
                this.body.velocity.x = 0;
                this.body.velocity.z = 0;
            }

            // Snap Turn
            if (inputState.look.x !== 0) {
                 this.camAngle.yaw -= inputState.look.x * 0.04;
                 // In VR, we rotate the Group (Player rig).
            }

            this.group.position.copy(this.body.position); //.add(new THREE.Vector3(0, 0, 0)); // VR Camera has its own offset usually?
            // Legacy: `playerGroup.position.copy(playerBody.position)` (No height offset for VR? Wait.)
            // Legacy Loop: `playerGroup.position.copy(playerBody.position)` directly.
            // But Camera is child. Camera local position is head pos.
            // If body is at feet (0,0,0), and head is at (0,1.7,0), then Camera world is correct.
            // Legacy body is sphere radius 0.6. Position starts at y=5.

            // Snap turn application
            // Only rotate the parent group around Y.
            // But we need to rotate around the HEAD position, not 0,0,0 of rig if player walked physically?
            // Simple approach: Rotate group.
            this.group.rotation.y = this.camAngle.yaw;

        } else {
            // Mobile/PC Mode
            // Look
            this.camAngle.yaw -= inputState.look.x * 0.004;
            this.camAngle.pitch -= inputState.look.y * 0.004;
            this.camAngle.pitch = Math.max(-1.5, Math.min(1.5, this.camAngle.pitch));

            // Move
            const yaw = this.camAngle.yaw;
            const move = inputState.move;
            const fwd = new THREE.Vector3(move.x, 0, move.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            // InputManager Mobile Stick: x is horizontal, y is vertical (down is positive?).
            // InputManager `dy = cy - start.y`. Down is positive.
            // So y>0 is backward.
            // Legacy: `fwd = (input.x, 0, input.y) ... velocity = fwd * speed`
            // If input.y is positive (down on screen), we move backward (positive Z). Correct.

            this.body.velocity.x = fwd.x * CONFIG.player.speed;
            this.body.velocity.z = fwd.z * CONFIG.player.speed;

            // Sync Visuals
            this.group.position.copy(this.body.position).add(new THREE.Vector3(0, CONFIG.player.height, 0));
            this.group.rotation.y = yaw;
            this.camera.rotation.x = this.camAngle.pitch;
        }

        // Jump
        if (inputState.jump) {
             // Check ground check? Legacy: `Math.abs(playerBody.velocity.y) < 1`
             if (Math.abs(this.body.velocity.y) < 1) {
                 this.body.velocity.y = CONFIG.player.jump;
             }
        }
    }

    getPosition() {
        return this.body.position;
    }
}
