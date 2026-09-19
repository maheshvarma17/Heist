/**
 * LootSystem.js
 * Creates and manages procedural 3D loot objects (Cash, Gold, Diamonds)
 * with bobbing/rotation visual effects and synchronized collection.
 */

import * as THREE from 'three';

export const LOOT_VALUES = {
  CASH: 100,
  GOLD: 250,
  DIAMONDS: 500,
};

export const LOOT_COLLECTION_RADIUS = 2.0;

export class LootSystem {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.onLootChange]
   */
  constructor(options = {}) {
    this.group = new THREE.Group();
    this.group.name = 'LootGroup';
    this.onLootChange = options.onLootChange || null;

    /** @type {Map<string, Object>} */
    this.items = new Map();
    this.totalCollectedValue = 0;
    this._animationTime = 0;

    this._initMaterials();
  }

  _initMaterials() {
    this.mats = {
      cash: new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        roughness: 0.6,
        metalness: 0.1,
      }),
      cashBand: new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        roughness: 0.5,
        metalness: 0.1,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.2,
        metalness: 0.9,
      }),
      diamond: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.6,
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: 0.9,
      }),
    };
  }

  /**
   * Add loot group to Three.js scene.
   * @param {THREE.Scene} scene
   */
  addToScene(scene) {
    scene.add(this.group);
  }

  /**
   * Build 3D mesh for a specific loot type.
   * @param {string} type
   * @returns {THREE.Group}
   */
  _createLootMesh(type) {
    const root = new THREE.Group();

    if (type === 'CASH') {
      // Stack of bills
      const stack = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.2, 0.3),
        this.mats.cash
      );
      stack.castShadow = true;
      root.add(stack);

      // Wrapper band
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.21, 0.31),
        this.mats.cashBand
      );
      root.add(band);
    } else if (type === 'GOLD') {
      // Two stacked gold bars
      const bar1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.15, 0.25),
        this.mats.gold
      );
      bar1.position.set(0, -0.06, 0);
      bar1.castShadow = true;
      root.add(bar1);

      const bar2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.14, 0.22),
        this.mats.gold
      );
      bar2.position.set(0, 0.08, 0);
      bar2.rotation.y = 0.2;
      bar2.castShadow = true;
      root.add(bar2);
    } else if (type === 'DIAMONDS') {
      // Faceted gem
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        this.mats.diamond
      );
      gem.castShadow = true;
      root.add(gem);
    }

    return root;
  }

  /**
   * Populate or synchronize loot items.
   * @param {Array<Object>} itemsData
   * @param {number} [totalValue=0]
   */
  initLootItems(itemsData = [], totalValue = 0) {
    // Clear existing meshes
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.items.clear();
    this.totalCollectedValue = totalValue;

    for (const item of itemsData) {
      const meshGroup = this._createLootMesh(item.type);
      meshGroup.position.set(item.position.x, item.position.y, item.position.z);
      meshGroup.visible = !item.collected;

      this.group.add(meshGroup);

      this.items.set(item.id, {
        id: item.id,
        type: item.type,
        value: item.value || LOOT_VALUES[item.type] || 100,
        position: { ...item.position },
        baseY: item.position.y,
        collected: Boolean(item.collected),
        collectedBy: item.collectedBy || null,
        collectedByName: item.collectedByName || null,
        meshGroup,
        phaseOffset: Math.random() * Math.PI * 2,
      });
    }

    if (this.onLootChange) {
      this.onLootChange(this.getStats());
    }
  }

  /**
   * Mark item collected and hide mesh.
   * @param {string} lootId
   * @param {Object} [data={}]
   */
  collectLoot(lootId, data = {}) {
    const item = this.items.get(lootId);
    if (!item) return;

    item.collected = true;
    item.collectedBy = data.collectedBy || null;
    item.collectedByName = data.playerName || null;
    if (item.meshGroup) {
      item.meshGroup.visible = false;
    }

    if (typeof data.totalValue === 'number') {
      this.totalCollectedValue = data.totalValue;
    } else {
      this.totalCollectedValue += item.value;
    }

    if (this.onLootChange) {
      this.onLootChange(this.getStats());
    }
  }

  /**
   * Find closest uncollected loot within interaction radius.
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} [maxRadius=LOOT_COLLECTION_RADIUS]
   * @returns {Object|null}
   */
  getClosestCollectable(position, maxRadius = LOOT_COLLECTION_RADIUS) {
    if (!position) return null;

    let closest = null;
    let minDistance = maxRadius;

    for (const item of this.items.values()) {
      if (item.collected) continue;

      const dx = position.x - item.position.x;
      const dz = position.z - item.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= minDistance) {
        minDistance = dist;
        closest = item;
      }
    }

    return closest;
  }

  /**
   * Get summary counts and value.
   * @returns {{ counts: Object, totals: Object, totalValue: number }}
   */
  getStats() {
    const counts = { CASH: 0, GOLD: 0, DIAMONDS: 0 };
    const totals = { CASH: 0, GOLD: 0, DIAMONDS: 0 };

    for (const item of this.items.values()) {
      if (totals[item.type] !== undefined) {
        totals[item.type]++;
        if (item.collected) {
          counts[item.type]++;
        }
      }
    }

    return {
      counts,
      totals,
      totalValue: this.totalCollectedValue,
    };
  }

  /**
   * Animate floating and rotation of uncollected loot items.
   * @param {number} dt
   */
  update(dt) {
    this._animationTime += dt;

    for (const item of this.items.values()) {
      if (item.collected || !item.meshGroup || !item.meshGroup.visible) continue;

      // Gentle continuous rotation
      item.meshGroup.rotation.y += dt * 1.5;

      // Slight floating/bobbing
      const bob = Math.sin(this._animationTime * 2.5 + item.phaseOffset) * 0.08;
      item.meshGroup.position.y = item.baseY + bob;
    }
  }

  /**
   * Reset all loot items to uncollected.
   */
  reset() {
    this.totalCollectedValue = 0;
    for (const item of this.items.values()) {
      item.collected = false;
      item.collectedBy = null;
      item.collectedByName = null;
      if (item.meshGroup) {
        item.meshGroup.visible = true;
        item.meshGroup.position.y = item.baseY;
      }
    }

    if (this.onLootChange) {
      this.onLootChange(this.getStats());
    }
  }
}
