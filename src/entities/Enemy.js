import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG, GameManager } from '../core/GameManager.js';

export class Enemy {
    constructor(scene, world, position, type='normal', id) {
        this.scene = scene;
        this.world = world;
        this.type = type;
        this.id = id;
        this.hp = 1;
        this.gameManager = GameManager.instance;
        this.isGiant = false;
        this.isTarget = false;

        this.mesh = null;
        this.body = null;

        this.create(position);
    }

    create(pos) {
        let sz = 0.6 + Math.random() * 0.8;
        let col = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);
        let ms = 15 * sz;
        let y = pos.y;

        // Base config by type
        if (this.type === 'floater_high') {
            col = new THREE.Color(CONFIG.colors.floater_high);
            y = 15; ms = 5;
        } else if (this.type === 'floater_low') {
            col = new THREE.Color(CONFIG.colors.floater_low);
            y = 5; ms = 10;
        } else if (this.type === 'jumper') {
            col = new THREE.Color(CONFIG.colors.jumper);
            y = 5; ms = 20;
        } else if (this.type === 'target') {
            this.isTarget = true;
            sz = 1.2; ms = 20;
            col = new THREE.Color(CONFIG.colors.target);
        } else if (this.type === 'giant') {
            this.isGiant = true;
            sz = 1.5; ms = 100;
            this.hp = 5;
            col = new THREE.Color(CONFIG.colors.giant);
        }

        // Body
        this.body = new CANNON.Body({
            mass: ms,
            material: this.world.materials ? this.world.materials.ene : new CANNON.Material('ene'),
            linearDamping: 0.4,
            collisionFilterGroup: 4,
            collisionFilterMask: 1 | 2 | 4 // Walls, Player, Other Enemies
        });

        // Shapes
        if (this.isGiant) {
            this.body.addShape(new CANNON.Sphere(1.5));
            this.body.addShape(new CANNON.Sphere(0.8), new CANNON.Vec3(0, 2, 0));
            this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 1.5)), new CANNON.Vec3(0, 0.5, 0));
        } else {
            this.body.addShape(new CANNON.Sphere(sz));
        }

        this.body.position.set(pos.x, y, pos.z);
        this.body.id = this.id; // Cannon body has .id, we overwrite? No, keep it. Add custom prop.
        this.body.userData = { type: this.type };
        this.world.addBody(this.body);

        // Mesh
        if (this.isGiant) {
             const g = new THREE.Group();
             const bm = new THREE.Mesh(new THREE.SphereGeometry(1.5), new THREE.MeshStandardMaterial({ color: col }));
             g.add(bm);
             const hm = new THREE.Mesh(new THREE.SphereGeometry(0.8), new THREE.MeshStandardMaterial({ color: 0x550000 }));
             hm.position.y = 2; g.add(hm);
             const am = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3), new THREE.MeshStandardMaterial({ color: 0x330000 }));
             am.position.y = 0.5; g.add(am);
             this.mesh = g;
        } else {
             let geo;
             if(this.type === 'floater_high') geo = new THREE.OctahedronGeometry(sz, 0);
             else if(this.type === 'floater_low') geo = new THREE.ConeGeometry(sz, sz*2, 8);
             else if(this.type === 'jumper') geo = new THREE.TorusGeometry(sz*0.6, sz*0.2, 8, 16);
             else if(this.isTarget) geo = new THREE.IcosahedronGeometry(sz, 1);
             else geo = new THREE.IcosahedronGeometry(sz, 0);

             const mat = new THREE.MeshStandardMaterial({ color: col, roughness: (this.isTarget ? 0.1 : 0.3), metalness: (this.isTarget ? 0.8 : 0.0) });
             this.mesh = new THREE.Mesh(geo, mat);
             if(this.type === 'floater_low') this.mesh.rotation.x = Math.PI/2;
        }

        this.scene.add(this.mesh);
    }

    update(dt, playerPos, vip) {
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        if (this.body.position.y < -10) {
            this.die(); // Fall off world
            return;
        }

        // Logic (Targeting)
        const target = (vip && vip.hp > 0) ? vip.body.position : playerPos;
        const d = target.vsub(this.body.position);
        d.normalize();

        // Type behaviors
        if (this.type === 'floater_high') {
           const hoverH = 12.0 + Math.sin(Date.now() * 0.002 + this.id) * 2;
           this.body.force.y += 30 * this.body.mass;
           const hDiff = hoverH - this.body.position.y;
           this.body.applyForce(new CANNON.Vec3(d.x * 5, hDiff * 5, d.z * 5), this.body.position);
        }
        else if (this.type === 'floater_low') {
           const hoverH = 3.0 + Math.cos(Date.now() * 0.005 + this.id);
           this.body.force.y += 30 * this.body.mass;
           const hDiff = hoverH - this.body.position.y;
           this.body.applyForce(new CANNON.Vec3(d.x * 30, hDiff * 10, d.z * 30), this.body.position);
        }
        else if (this.type === 'jumper') {
           if (this.body.position.y < 1.0 && this.body.velocity.y < 0.1) {
               this.body.velocity.y = 15;
               this.body.velocity.x = d.x * 10;
               this.body.velocity.z = d.z * 10;
           }
        }
        else {
           // Normal / Target / Giant
           this.body.applyForce(d.scale(this.isGiant ? 100 : 20), this.body.position);
        }

        // Attack VIP
        if (vip && this.body.position.distanceTo(vip.body.position) < 2.0 && Math.random() < 0.05) {
            vip.takeDamage(5);
        }
    }

    takeMetsuDamage() {
        if (this.isGiant && this.hp > 0) {
            this.hp--;
            // Effect?
            const particleColor = 0xffaa00;
            // Need particle spawner. Assuming global or passed in update?
            // We'll dispatch event for particles to Main/Scene.
            // Or just call window function for now.
        } else {
            this.die();
        }
    }

    die(isEscape=false) {
        this.gameManager.checkClearCondition(this.type, isEscape);

        this.scene.remove(this.mesh);
        this.world.removeBody(this.body);

        // Spawn Item?
        if (!isEscape && Math.random() < 0.3) {
             // Dispatch 'spawnItem' at this.body.position
             // We'll handle this in EnemyManager or Main
             if (window.spawnItem) window.spawnItem(this.body.position);
        }

        // Remove from list
        if (window.enemyManager) window.enemyManager.removeEnemy(this);
    }
}
