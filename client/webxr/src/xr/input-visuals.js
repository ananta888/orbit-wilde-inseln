import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const PATH = '/vendor/xr-profiles/';
const fingers = {
  thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
};

class HandSkin {
  constructor(asset, material) {
    this.root = new THREE.Group(); this.object = clone(asset.scene.children[0]); this.root.add(this.object);
    this.bones = new Map(); this.rest = new Map(); this.curls = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
    this.object.traverse(child => {
      if (child.isBone) this.bones.set(child.name, child);
      if (child.isMesh) { child.material = material; child.frustumCulled = false; child.castShadow = child.receiveShadow = true; }
    });
    const wrist = this.bones.get('wrist'), inverse = wrist.quaternion.clone().invert();
    for (const [name, bone] of this.bones) this.rest.set(name, {
      position: bone.position.clone().sub(wrist.position).applyQuaternion(inverse),
      quaternion: inverse.clone().multiply(bone.quaternion),
    });
  }
  track(hand) {
    let visible = 0;
    for (const [name, bone] of this.bones) {
      const joint = hand.joints[name];
      if (joint?.visible) { bone.position.copy(joint.position); bone.quaternion.copy(joint.quaternion); visible++; }
    }
    this.root.visible = visible >= 23 && !!hand.joints.wrist?.visible;
  }
  pose(dt, gamepad, bowRole, drawing) {
    for (const [name, bone] of this.bones) {
      bone.position.copy(this.rest.get(name).position); bone.quaternion.copy(this.rest.get(name).quaternion);
    }
    const trigger = gamepad?.buttons[0]?.value || 0, grip = gamepad?.buttons[1]?.value || 0;
    for (const [name, chain] of Object.entries(fingers)) {
      let target = name === 'index' ? .15 + trigger * .8 : name === 'thumb' ? .38 : .68 + grip * .3;
      if (bowRole === 'bow') target = name === 'thumb' ? .55 : .9;
      if (bowRole === 'string') target = ['index', 'middle', 'ring'].includes(name) ? (drawing ? .9 : .28) : .5;
      this.curls[name] = THREE.MathUtils.damp(this.curls[name], target, 18, dt);
      const curl = this.curls[name];
      const rotation = name === 'thumb' ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sign(this.rest.get(chain[0]).position.x) * curl * .6) : new THREE.Quaternion();
      for (let i = 1; i < chain.length; i++) {
        const bone = this.bones.get(chain[i]), previous = this.bones.get(chain[i - 1]);
        const rest = this.rest.get(chain[i]), prior = this.rest.get(chain[i - 1]);
        bone.position.copy(rest.position).sub(prior.position).applyQuaternion(rotation).add(previous.position);
        if (i < chain.length - 1) {
          const amount = name === 'thumb' ? -.25 * curl : -(i === 1 ? .5 : .72) * curl;
          rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), amount));
        }
        bone.quaternion.copy(rotation).multiply(rest.quaternion);
      }
    }
  }
}

/** Tracked hand bones and grip-space controller models, all served from the laptop. */
export class InputVisuals {
  constructor(renderer, rig, controllers, hands) {
    Object.assign(this, { renderer, rig, controllers, hands });
    this.grips = []; this.skins = new Map(); this.handSkins = new Map(); this.ready = false;
    const factory = new XRControllerModelFactory().setPath(PATH);
    this.material = new THREE.MeshStandardMaterial({ color: '#d6a482', roughness: .64, metalness: 0 });
    this.entries = controllers.map((controller, index) => {
      const grip = renderer.xr.getControllerGrip(index); rig.add(grip); this.grips.push(grip);
      const model = factory.createControllerModel(grip); grip.add(model);
      const bowPose = new THREE.Group(), pinchPose = new THREE.Group(); rig.add(bowPose, pinchPose);
      const entry = { grip, model, controller, hand: hands[index], bowPose, pinchPose, source: null, wrist: new THREE.Vector3() };
      const connect = event => {
        entry.source = event.data; grip.userData.source = event.data; hands[index].userData.source = event.data;
        controller.userData.grip = grip; controller.userData.bowGrip = event.data.hand ? bowPose : grip;
        controller.userData.pinchPose = event.data.hand ? pinchPose : grip;
      };
      controller.addEventListener('connected', connect);
      controller.addEventListener('disconnected', () => {
        entry.source = null; grip.userData.source = hands[index].userData.source = null;
        for (const key of ['bowGrip', 'pinchPose', 'grip']) delete controller.userData[key];
      });
      return entry;
    });
    const loader = new GLTFLoader();
    this.loading = Promise.all(['left', 'right'].map(async side => {
      const asset = await loader.loadAsync(PATH + 'generic-hand/' + side + '.glb');
      const controllerSkin = new HandSkin(asset, this.material), trackedSkin = new HandSkin(asset, this.material);
      this.skins.set(side, controllerSkin); this.handSkins.set(side, trackedSkin);
      controllerSkin.root.name = side + '-controller-hand'; trackedSkin.root.name = side + '-tracked-hand';
      rig.add(controllerSkin.root); rig.add(trackedSkin.root);
      controllerSkin.root.visible = trackedSkin.root.visible = false;
    })).then(() => { this.ready = true; }).catch(() => { this.loadError = 'Handmodelle fehlen; npm ci und lokale Profile prüfen.'; });
  }
  update(dt, active, bow, menuOpen = false) {
    for (const skin of [...this.skins.values(), ...this.handSkins.values()]) skin.root.visible = false;
    for (const entry of this.entries) {
      const { source, grip, hand, model, controller, bowPose, pinchPose } = entry;
      entry.tracked = false; bowPose.visible = pinchPose.visible = false;
      model.visible = active && !!source && !source.hand && (!bow.root.visible || menuOpen);
      if (!active || !source || !controller.visible) continue;
      const side = source.handedness, skin = this.skins.get(side), trackedSkin = this.handSkins.get(side);
      if (source.hand) {
        if (!hand.visible || !hand.joints?.wrist?.visible) continue;
        const wrist = hand.joints.wrist; entry.tracked = true; bowPose.visible = true;
        if (trackedSkin) { if (trackedSkin.root.parent !== hand) hand.add(trackedSkin.root); trackedSkin.root.position.set(0, 0, 0); trackedSkin.root.quaternion.identity(); trackedSkin.track(hand); }
        hand.updateWorldMatrix(true, false); wrist.getWorldPosition(entry.wrist);
        const point = entry.wrist.clone();
        const middle = hand.joints['middle-finger-metacarpal'];
        if (middle?.visible) point.lerp(middle.getWorldPosition(new THREE.Vector3()), .7);
        bowPose.position.copy(this.rig.worldToLocal(point));
        bowPose.quaternion.copy(this.rig.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(wrist.getWorldQuaternion(new THREE.Quaternion()));
        const tip = hand.joints['index-finger-tip'], thumb = hand.joints['thumb-tip'];
        if (tip?.visible && thumb?.visible) {
          pinchPose.visible = true;
          pinchPose.position.copy(this.rig.worldToLocal(tip.getWorldPosition(new THREE.Vector3()).lerp(thumb.getWorldPosition(new THREE.Vector3()), .5)));
          pinchPose.quaternion.copy(bowPose.quaternion);
        }
      } else if (skin && grip.visible) {
        entry.tracked = true;
        if (skin.root.parent !== grip) grip.add(skin.root);
        skin.root.position.set(side === 'left' ? -.012 : .012, -.026, .07);
        skin.root.rotation.set(-.15, 0, side === 'left' ? 1.4 : -1.4); skin.root.visible = true;
        skin.pose(dt, source.gamepad, bow.root.visible && !menuOpen ? (side === bow.hand ? 'bow' : 'string') : '', bow.drawing);
        skin.root.getWorldPosition(entry.wrist);
      }
    }
  }
  wrist(side) {
    const entry = this.entries.find(item => item.source?.handedness === side && item.tracked);
    return entry ? entry.wrist : null;
  }
}
