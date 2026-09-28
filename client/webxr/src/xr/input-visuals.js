import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HandSkin, trackedBowGrip } from './hand-pose.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const PATH = '/vendor/xr-profiles/';
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
        const wrist = hand.joints.wrist; entry.tracked = true;
        if (trackedSkin) { if (trackedSkin.root.parent !== hand) hand.add(trackedSkin.root); trackedSkin.root.position.set(0, 0, 0); trackedSkin.root.quaternion.identity(); trackedSkin.track(hand); }
        hand.updateWorldMatrix(true, false); wrist.getWorldPosition(entry.wrist);
        const point = new THREE.Vector3(), orientation = new THREE.Quaternion();
        bowPose.visible = trackedBowGrip(hand, side, point, orientation);
        if (bowPose.visible) {
          bowPose.position.copy(this.rig.worldToLocal(point));
          bowPose.quaternion.copy(this.rig.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(orientation);
        }
        const tip = hand.joints['index-finger-tip'], thumb = hand.joints['thumb-tip'];
        if (tip?.visible && thumb?.visible) {
          pinchPose.visible = true;
          pinchPose.position.copy(this.rig.worldToLocal(tip.getWorldPosition(new THREE.Vector3()).lerp(thumb.getWorldPosition(new THREE.Vector3()), .5)));
          pinchPose.quaternion.copy(bowPose.quaternion);
        }
      } else if (skin && grip.visible) {
        entry.tracked = true;
        if (skin.root.parent !== grip) grip.add(skin.root);
        skin.attachToGrip(side); skin.root.visible = true;
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
