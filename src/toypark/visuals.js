import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TOY_PARK_TRACK_TILE_LIBRARY, isToyParkTileRenderReady } from './config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const shadowsEnabled = (app) => Boolean(app.performanceTuning?.shadows ?? app.performanceProfile?.shadows ?? true);
const TOY_PARK_RAIL_TILE_CONNECTOR_OVERLAP = 0.18;

const buildFlushChunks = (length, targetChunkLength, gap) => {
  const chunkCount = Math.max(1, Math.ceil(length / targetChunkLength));
  return Array.from({ length: chunkCount }, (_, chunkIndex) => {
    const rawStart = chunkIndex * (length / chunkCount);
    const rawEnd = (chunkIndex + 1) * (length / chunkCount);
    // Keep board/tile ends flush; trim only internal decorative seams.
    const trimStart = chunkIndex === 0 ? 0 : gap / 2;
    const trimEnd = chunkIndex === chunkCount - 1 ? 0 : gap / 2;
    return {
      chunkIndex,
      chunkCount,
      start: rawStart + trimStart,
      end: rawEnd - trimEnd,
      rawStart,
      rawEnd,
      flushStart: chunkIndex === 0,
      flushEnd: chunkIndex === chunkCount - 1,
    };
  });
};

export function addToyParkTrackTileRibbons(app, sourceMaterial = null) {
    if (app.physicsMechanicKey !== 'toyPark' || !Array.isArray(app.trackPieces)) return;
    const straightMat = new THREE.MeshPhysicalMaterial({
      color: 0x8fd8ff,
      roughness: 0.84,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.86,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const candyPopStraightMat = new THREE.MeshPhysicalMaterial({
      color: 0xffb07c,
      roughness: 0.86,
      metalness: 0,
      clearcoat: 0.05,
      clearcoatRoughness: 0.88,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: 0,
    });
    const variableBendMat = new THREE.MeshPhysicalMaterial({
      color: 0xffc86e,
      roughness: 0.84,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.86,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const windmillCircleMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8bdff,
      roughness: 0.92,
      metalness: 0,
      clearcoat: 0.025,
      clearcoatRoughness: 0.94,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: 0,
    });

    const mintSpikeBendMat = new THREE.MeshPhysicalMaterial({
      color: 0x98f2c6,
      roughness: 0.88,
      metalness: 0,
      clearcoat: 0.05,
      clearcoatRoughness: 0.9,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const candyRampMat = new THREE.MeshPhysicalMaterial({
      color: 0xff7a00,
      roughness: 0.86,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.88,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const candyRampCrestMat = new THREE.MeshPhysicalMaterial({
      color: 0xff5c00,
      roughness: 0.84,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.86,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    straightMat.userData = {
      type: 'toy-park-straight-road-tile-surface-material',
      opaqueClay: true,
      tileSurfaceColor: 'sky-blue-direct-track-board-color',
      sourceTrackMaterialStyle: sourceMaterial?.userData?.style || null,
      clayGrain: 'opaque-pastel-molded-clay-plastic',
      thickerMoldedLook: true,
    };
    candyPopStraightMat.userData = {
      type: 'toy-park-candy-pop-straight-obstacle-tile-surface-material',
      opaqueClay: true,
      tileSurfaceColor: 'pink-orange-direct-track-board-color',
      obstacleTile: true,
      obstaclePattern: 'alternating-left-right-candy-pop-bumpers',
      sourceTrackMaterialStyle: sourceMaterial?.userData?.style || null,
      clayGrain: 'opaque-pastel-molded-clay-plastic',
      thickerMoldedLook: true,
    };
    variableBendMat.userData = {
      type: 'toy-park-variable-angle-bend-tile-surface-material',
      opaqueClay: true,
      tileSurfaceColor: 'warm-orange-direct-track-board-color',
      angleVariable: true,
      sourceTrackMaterialStyle: sourceMaterial?.userData?.style || null,
      clayGrain: 'opaque-pastel-molded-clay-plastic',
      thickerMoldedLook: true,
    };
    windmillCircleMat.userData = {
      type: 'toy-park-windmill-spinner-circle-tile-surface-material',
      opaqueClay: true,
      tileSurfaceColor: 'light-purple-direct-track-board-color',
      obstacleTile: true,
      circleTile: true,
      obstaclePattern: 'center-four-blade-rotating-windmill-spinner',
      sourceTrackMaterialStyle: sourceMaterial?.userData?.style || null,
      clayGrain: 'opaque-pastel-molded-clay-plastic',
      thickerMoldedLook: true,
    };
    mintSpikeBendMat.userData = {
      type: 'toy-park-mint-chocolate-spike-45-bend-render-ready-tile-surface-material',
      opaqueClay: true,
      tileSurfaceColor: 'mint-green-direct-track-board-color',
      obstacleTile: true,
      draftTile: false,
      renderReadyTile: true,
      obstaclePattern: 'one-second-up-one-second-down-marble-sized-chocolate-cone-spikes',
      sourceTrackMaterialStyle: sourceMaterial?.userData?.style || null,
      clayGrain: 'opaque-pastel-molded-clay-plastic',
      thickerMoldedLook: true,
    };
    candyRampMat.userData = {
      type: 'toy-park-candy-ramp-straight-render-ready-tile-surface-material',
      opaqueClay: true,
      tileSurfaceColor: 'orange-gentle-ramp-on-sky-blue-board',
      draftTile: false,
      renderReadyTile: true,
      webPreviewOnly: false,
      terrainTile: true,
      terrainProfile: 'flat-up-slope-short-crest-down-slope-flat',
      sourceTrackMaterialStyle: sourceMaterial?.userData?.style || null,
      clayGrain: 'opaque-pastel-molded-clay-plastic',
      thickerMoldedLook: true,
    };
    candyRampCrestMat.userData = {
      type: 'toy-park-candy-ramp-crest-marker-material',
      opaqueClay: true,
      tileSurfaceColor: 'warm-orange-ramp-crest-marker-strip',
      draftTile: false,
      renderReadyTile: true,
      webPreviewOnly: false,
      terrainTile: true,
      clayGrain: 'opaque-pastel-molded-clay-plastic',
    };
    const cancelledBridgeSurfaceMaterials = new Map();
    const counts = { straight: 0, rampUp: 0, elevatedStraight: 0, rampDown: 0, variableBend: 0, windmillCircle: 0, uTurn180: 0, corner45: 0 };
    app.trackPieces.forEach((piece, index) => {
      if (!piece.tileKey) return;
      const isCandyPopStraight = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.candyPopStraightObstacle?.key;
      const isWindmillCircle = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.windmillSpinnerCircle?.key;
      const isCandyRampDraft = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.candyRampStraightDraft?.key;
      const isCandyRampRenderReady = isCandyRampDraft && isToyParkTileRenderReady(TOY_PARK_TRACK_TILE_LIBRARY.candyRampStraightDraft);
      const isMintSpikeBend45Draft = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.mintSpikeBend45Draft?.key;
      const isVariableBend = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.variableBend.key;
      const isRampUp = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampUp.key;
      const isElevatedStraight = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.key;
      const isRampDown = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampDown.key;
      const material = cancelledBridgeSurfaceMaterials.get(piece.tileKey) || (isCandyPopStraight ? candyPopStraightMat : (isCandyRampDraft ? straightMat : (isMintSpikeBend45Draft ? mintSpikeBendMat : (isVariableBend ? variableBendMat : straightMat))));
      const samples = [];
      const startD = clamp(piece.startD, 0, app.trackLength);
      const endD = clamp(piece.endD, startD, app.trackLength);
      const steps = Math.max(2, Math.ceil((endD - startD) / 0.9));
      for (let i = 0; i <= steps; i += 1) {
        const d = startD + (endD - startD) * (i / steps);
        samples.push({ ...app.getTrackPointAt(d), d });
      }
      const tileType = piece.tileKey;
      const tileName = isCandyPopStraight
        ? `TOY_PARK_CANDY_POP_STRAIGHT_OBSTACLE_TILE_SURFACE_${counts.straight}`
        : isWindmillCircle
        ? `TOY_PARK_WINDMILL_SPINNER_CIRCLE_TILE_SURFACE_${counts.windmillCircle}`
        : isCandyRampDraft
          ? `TOY_PARK_CANDY_RAMP_STRAIGHT_RENDER_READY_TILE_BASE_SURFACE_${counts.straight}`
          : isMintSpikeBend45Draft
            ? `TOY_PARK_MINT_SPIKE_45_BEND_DRAFT_TILE_SURFACE_${counts.variableBend}`
            : isVariableBend
              ? `TOY_PARK_VARIABLE_ANGLE_BEND_TILE_SURFACE_${counts.variableBend}`
            : isRampUp
              ? `TOY_PARK_RAMP_UP_ROAD_TILE_SURFACE_${counts.rampUp}`
              : isElevatedStraight
                ? `TOY_PARK_ELEVATED_STRAIGHT_ROAD_TILE_SURFACE_${counts.elevatedStraight}`
                : isRampDown
                  ? `TOY_PARK_RAMP_DOWN_ROAD_TILE_SURFACE_${counts.rampDown}`
                  : `TOY_PARK_STRAIGHT_ROAD_TILE_SURFACE_${counts.straight}`;
      const mesh = app.addTrackRibbon(samples, app.trackWidth, material, {
        name: tileName,
        distanceStart: Number(startD.toFixed(2)),
        distanceEnd: Number(endD.toFixed(2)),
        renderOrder: isWindmillCircle ? 3 : (isVariableBend ? 2 : 1),
        userData: {
          type: tileType,
          tileKey: piece.tileKey,
          tileLabel: piece.tileLabel,
          pieceType: piece.type,
          turnDegrees: piece.turnDegrees,
          distanceStart: Number(startD.toFixed(2)),
          distanceEnd: Number(endD.toFixed(2)),
          surfaceRole: 'direct-colored-track-board-surface',
          markerRole: 'none-direct-track-surface-color',
          physicsPreserved: true,
          tileSurfaceColor: isCandyPopStraight
            ? 'pink-orange-candy-pop-straight-obstacle'
            : isWindmillCircle
              ? 'sky-blue-host-straight-under-short-purple-windmill-overlay'
              : isCandyRampDraft
                ? 'sky-blue-base-with-orange-gentle-ramp-overlay-render-ready'
                : isMintSpikeBend45Draft
                ? 'mint-green-chocolate-pop-up-cone-spike-45-bend-render-ready'
                : isVariableBend
                  ? 'warm-orange-variable-bend'
                : isRampUp
                  ? 'mint-green-ramp-up'
                  : isElevatedStraight
                    ? 'lavender-elevated-straight'
                    : isRampDown
                      ? 'mint-green-ramp-down'
                      : 'sky-blue',
          variableAngleDegrees: piece.variableAngleDegrees ?? null,
          elevationRole: piece.elevationRole ?? null,
          bridgeModule: Boolean(piece.bridgeModule),
          bridgeModuleRole: piece.bridgeModuleRole ?? null,
          bridgeHeight: piece.bridgeHeight ?? 0,
          obstacleTile: isCandyPopStraight || isWindmillCircle || isMintSpikeBend45Draft,
          terrainTile: isCandyRampDraft,
          draftTile: isCandyRampDraft && !isCandyRampRenderReady,
          renderReadyTile: isMintSpikeBend45Draft || isCandyRampRenderReady,
          webPreviewOnly: isCandyRampDraft && !isCandyRampRenderReady,
          circleTile: isWindmillCircle,
          obstaclePattern: isCandyPopStraight ? 'alternating-left-right-candy-pop-bumpers' : (isWindmillCircle ? 'center-four-blade-rotating-windmill-spinner' : (isMintSpikeBend45Draft ? 'centerline-one-second-pop-up-cone-spikes' : null)),
          terrainProfile: isCandyRampDraft ? 'flat-up-slope-short-crest-down-slope-flat-physical-render-ready' : null,
          rampHeight: isCandyRampDraft ? TOY_PARK_TRACK_TILE_LIBRARY.candyRampStraightDraft?.rampHeight ?? 0.65 : null,
          pathHeightMode: piece.pathHeightMode ?? null,
          uTurn180: false,
        },
      });
      mesh.userData.tileIndex = index;
      if (isCandyRampDraft) {
        const rampCfg = TOY_PARK_TRACK_TILE_LIBRARY.candyRampStraightDraft || {};
        const sections = rampCfg.rampSections || { entryFlat: 2, upSlope: 3.5, crest: 3, downSlope: 3.5, exitFlat: 2 };
        const configuredLength = Math.max(0.001,
          (sections.entryFlat || 0) + (sections.upSlope || 0) + (sections.crest || 0) + (sections.downSlope || 0) + (sections.exitFlat || 0)
        );
        const scale = Math.max(0.001, (endD - startD) / configuredLength);
        const entryEnd = startD + (sections.entryFlat || 0) * scale;
        const upEnd = entryEnd + (sections.upSlope || 0) * scale;
        const crestEnd = upEnd + (sections.crest || 0) * scale;
        const downEnd = crestEnd + (sections.downSlope || 0) * scale;
        const rampHeight = rampCfg.rampHeight ?? 0.65;
        const rampLiftAt = (distance) => {
          if (distance <= entryEnd || distance >= downEnd) return 0;
          if (distance < upEnd) return rampHeight * ((distance - entryEnd) / Math.max(0.001, upEnd - entryEnd));
          if (distance <= crestEnd) return rampHeight;
          return rampHeight * (1 - ((distance - crestEnd) / Math.max(0.001, downEnd - crestEnd)));
        };
        const rampSamples = [];
        const rampSteps = Math.max(6, Math.ceil((downEnd - entryEnd) / 0.55));
        for (let i = 0; i <= rampSteps; i += 1) {
          const d = entryEnd + (downEnd - entryEnd) * (i / rampSteps);
          const point = app.getTrackPointAt(d);
          rampSamples.push({ ...point, y: point.y + 0.035, d });
        }
        const rampMesh = app.addTrackRibbon(rampSamples, app.trackWidth * 0.68, candyRampMat, {
          name: `TOY_PARK_CANDY_RAMP_STRAIGHT_RENDER_READY_TILE_ORANGE_RAMP_${counts.straight}`,
          distanceStart: Number(entryEnd.toFixed(2)),
          distanceEnd: Number(downEnd.toFixed(2)),
          renderOrder: 4,
          userData: {
            type: 'toy-park-candy-ramp-straight-render-ready-orange-ramp-overlay',
            tileKey: piece.tileKey,
            tileLabel: piece.tileLabel,
            draftTile: isCandyRampDraft && !isCandyRampRenderReady,
            renderReadyTile: isCandyRampRenderReady,
            webPreviewOnly: isCandyRampDraft && !isCandyRampRenderReady,
            terrainTile: true,
            rampOverlay: true,
            terrainProfile: rampCfg.terrainProfile || 'flat-up-slope-short-crest-down-slope-flat',
            rampHeight: Number(rampHeight.toFixed(3)),
            rampSections: sections,
            physicsPreserved: true,
            physicsPolicy: rampCfg.physicsPolicy || 'physical-centerline-and-cannon-track-height-follow-gentle-ramp-profile',
            connectorWidthPolicy: rampCfg.connectorWidthPolicy || null,
          },
        });
        rampMesh.userData.tileIndex = index;
        const crestSamples = [];
        const crestSteps = Math.max(2, Math.ceil((crestEnd - upEnd) / 0.45));
        for (let i = 0; i <= crestSteps; i += 1) {
          const d = upEnd + (crestEnd - upEnd) * (i / crestSteps);
          const point = app.getTrackPointAt(d);
          crestSamples.push({ ...point, y: point.y + 0.055, d });
        }
        const crestMesh = app.addTrackRibbon(crestSamples, app.trackWidth * 0.42, candyRampCrestMat, {
          name: `TOY_PARK_CANDY_RAMP_STRAIGHT_RENDER_READY_TILE_ORANGE_CREST_${counts.straight}`,
          distanceStart: Number(upEnd.toFixed(2)),
          distanceEnd: Number(crestEnd.toFixed(2)),
          renderOrder: 5,
          userData: {
            type: 'toy-park-candy-ramp-straight-render-ready-orange-crest-marker',
            tileKey: piece.tileKey,
            tileLabel: piece.tileLabel,
            draftTile: isCandyRampDraft && !isCandyRampRenderReady,
            renderReadyTile: isCandyRampRenderReady,
            webPreviewOnly: isCandyRampDraft && !isCandyRampRenderReady,
            terrainTile: true,
            rampCrestMarker: true,
            rampHeight: Number(rampHeight.toFixed(3)),
            markerRole: 'warm-orange-short-crest-strip-on-gentle-ramp',
          },
        });
        crestMesh.userData.tileIndex = index;
      }
      if (isWindmillCircle) {
        const midD = (startD + endD) / 2;
        const midPoint = app.getTrackPointAt(midD);
        const midFrame = app.getTrackFrameAt(midD);
        const localWidth = midPoint.w ?? app.getTrackWidthAt(midD) ?? app.trackWidth;
        const circleDiameter = localWidth * 1.95;
        const circleRadius = circleDiameter / 2;
        const railRadius = app.trackStats?.toyParkRailRadius ?? 0.784;
        const railOffset = app.trackStats?.toyParkRailOffset ?? 0.392;
        const connectorDepth = Math.max(0.85, railRadius * 1.1);
        const group = new THREE.Group();
        group.name = `TOY_PARK_WINDMILL_SPINNER_CIRCLE_TILE_BOARD_${counts.windmillCircle}`;
        group.position.set(midPoint.x, midPoint.y + 0.018, midPoint.z);
        const yaw = Math.atan2(midFrame.tangent.x, midFrame.tangent.z);
        const pitch = Math.atan2(midFrame.tangent.y, Math.max(0.0001, Math.hypot(midFrame.tangent.x, midFrame.tangent.z)));
        app.applyTrackSlopeRotation?.(group, yaw, pitch);
        group.userData = {
          type: 'toy-park-windmill-spinner-circle-board-module',
          tileKey: piece.tileKey,
          tileLabel: piece.tileLabel,
          circleTile: true,
          circularBoard: true,
          diameterScaleVsStandardRoadWidth: 1.95,
          circleDiameter: Number(circleDiameter.toFixed(3)),
          connectorWidth: Number(localWidth.toFixed(3)),
          connectorPolicy: 'straight-light-purple-road-surface-passes-through-circle-no-rails-inside-spinner-uniform-approach-exit-overhang',
          outsideConnectorSurfaceCount: 0,
          ribbonRailCount: 0,
          straightSurfaceThroughCircle: true,
          noRailsInsideSpinnerCircle: true,
          circleRailOpeningPolicy: 'open-at-local-negative-z-and-positive-z-for-straight-road-surface-with-rounded-rail-end-caps',
          surfaceAndRailColor: 'light-purple',
        };
        const circleFloor = new THREE.Mesh(new THREE.CylinderGeometry(circleRadius, circleRadius, 0.085, 80), windmillCircleMat);
        circleFloor.name = `TOY_PARK_WINDMILL_SPINNER_CIRCLE_LIGHT_PURPLE_FLOOR_${counts.windmillCircle}`;
        circleFloor.position.y = 0;
        circleFloor.receiveShadow = shadowsEnabled(app);
        circleFloor.userData = {
          type: 'toy-park-windmill-spinner-circle-floor',
          circularBoard: true,
          diameter: Number(circleDiameter.toFixed(3)),
          lightPurpleTrack: true,
          outsideConnectorsCancelled: true,
        };
        group.add(circleFloor);
        const desiredApproachSurfaceOverhang = Math.max(1.7, Math.min(localWidth * 0.3, railRadius * 2.25));
        const pieceLength = Math.max(0, endD - startD);
        const seamMargin = Math.max(0.24, railRadius * 0.22);
        const maxApproachSurfaceOverhang = Math.max(0, (pieceLength - seamMargin * 2 - circleDiameter) / 2);
        const approachSurfaceOverhang = Math.max(0, Math.min(desiredApproachSurfaceOverhang, maxApproachSurfaceOverhang));
        const passThroughDepth = circleDiameter;
        const totalPurpleFootprintDepth = circleDiameter + approachSurfaceOverhang * 2;
        const passThroughSurface = new THREE.Mesh(
          new THREE.BoxGeometry(localWidth, 0.052, passThroughDepth),
          windmillCircleMat
        );
        passThroughSurface.name = `TOY_PARK_WINDMILL_SPINNER_CIRCLE_CENTER_STRAIGHT_LIGHT_PURPLE_ROAD_SURFACE_${counts.windmillCircle}`;
        passThroughSurface.position.y = 0.071;
        passThroughSurface.receiveShadow = shadowsEnabled(app);
        passThroughSurface.userData = {
          type: 'toy-park-windmill-spinner-circle-straight-light-purple-road-surface-no-rail',
          tileKey: piece.tileKey,
          straightRoadSurfaceThroughCircle: true,
          centerCircleSurfaceOnly: true,
          noRailsInsideSpinnerCircle: true,
          surfaceOnly: true,
          railCountInsideCircle: 0,
          width: Number(localWidth.toFixed(3)),
          depth: Number(passThroughDepth.toFixed(3)),
          circleDiameter: Number(circleDiameter.toFixed(3)),
          desiredApproachSurfaceOverhang: Number(desiredApproachSurfaceOverhang.toFixed(3)),
          approachSurfaceOverhang: Number(approachSurfaceOverhang.toFixed(3)),
          seamMargin: Number(seamMargin.toFixed(3)),
          totalPurpleFootprintDepth: Number(totalPurpleFootprintDepth.toFixed(3)),
          clampedToHostPiece: approachSurfaceOverhang < desiredApproachSurfaceOverhang - 0.001,
          pieceLength: Number(pieceLength.toFixed(3)),
          splitTransitionSurfaces: true,
          materialColor: 'light-purple',
          purpose: 'circle-interior-straight-purple-road-only-transition-boards-are-separate-short-railed-pieces',
        };
        group.add(passThroughSurface);
        let transitionSurfaceCount = 0;
        if (approachSurfaceOverhang > 0.08) {
          [
            { zone: 'approach', z: -circleRadius - approachSurfaceOverhang / 2 },
            { zone: 'exit', z: circleRadius + approachSurfaceOverhang / 2 },
          ].forEach(({ zone, z }) => {
            const transitionSurface = new THREE.Mesh(
              new THREE.BoxGeometry(localWidth, 0.058, approachSurfaceOverhang),
              windmillCircleMat
            );
            transitionSurface.name = `TOY_PARK_WINDMILL_SPINNER_CIRCLE_${zone.toUpperCase()}_SHORT_RAILED_TRANSITION_SURFACE_${counts.windmillCircle}`;
            transitionSurface.position.set(0, 0.076, z);
            transitionSurface.receiveShadow = shadowsEnabled(app);
            transitionSurface.userData = {
              type: 'toy-park-windmill-spinner-circle-short-railed-transition-surface',
              tileKey: piece.tileKey,
              transitionZone: zone,
              shortTransitionSurface: true,
              hasLeftRightRails: true,
              noRailInsideSpinnerCircle: true,
              width: Number(localWidth.toFixed(3)),
              depth: Number(approachSurfaceOverhang.toFixed(3)),
              circleDiameter: Number(circleDiameter.toFixed(3)),
              totalPurpleFootprintDepth: Number(totalPurpleFootprintDepth.toFixed(3)),
              purpose: 'short-purple-approach-exit-board-with-visible-side-rails-not-one-long-unrailed-strip',
            };
            group.add(transitionSurface);
            transitionSurfaceCount += 1;
          });
        }
        const railMat = new THREE.MeshPhysicalMaterial({ color: 0xd8bdff, roughness: 0.93, metalness: 0, clearcoat: 0.025, clearcoatRoughness: 0.94, side: THREE.DoubleSide, transparent: false, opacity: 1, depthWrite: true });
        railMat.userData = { type: 'toy-park-windmill-spinner-circle-light-purple-rail-material', tileRailColor: 'light-purple', circularRail: true, opaqueClay: true, clayGrain: 'chunky-pastel-molded-clay-plastic', halfRoundRailProfile: true };
        const halfRoundRailRadius = railRadius;
        const halfRoundRailBaseY = 0.104;
        const makeLocalHalfRoundRail = (samples, name, userData) => {
          const rail = buildToyParkHalfRoundRailMesh(app,
            samples,
            halfRoundRailRadius,
            railMat,
            name,
            {
              ...userData,
              halfRoundRailProfile: true,
              matchesOtherToyParkTileRails: true,
              noCylindricalTubeRail: true,
            }
          );
          rail.castShadow = shadowsEnabled(app);
          rail.receiveShadow = shadowsEnabled(app);
          return rail;
        };
        let transitionSideRailCount = 0;
        const transitionRailX = localWidth / 2 + railOffset;
        const makeStraightTransitionRailSamples = (side, zCenter, length) => {
          const segmentCount = Math.max(3, Math.ceil(length / 0.28));
          const samples = [];
          for (let i = 0; i <= segmentCount; i += 1) {
            const t = i / segmentCount;
            const z = zCenter - length / 2 + length * t;
            samples.push({
              center: new THREE.Vector3(side * transitionRailX, halfRoundRailBaseY, z),
              right: new THREE.Vector3(side, 0, 0),
              y: halfRoundRailBaseY,
            });
          }
          return samples;
        };
        [
          { zone: 'approach', z: -circleRadius - approachSurfaceOverhang / 2 },
          { zone: 'exit', z: circleRadius + approachSurfaceOverhang / 2 },
        ].forEach(({ zone, z }) => {
          [-1, 1].forEach((side) => {
            const rail = makeLocalHalfRoundRail(
              makeStraightTransitionRailSamples(side, z, approachSurfaceOverhang),
              `TOY_PARK_WINDMILL_SPINNER_CIRCLE_LIGHT_PURPLE_${zone.toUpperCase()}_HALF_ROUND_SIDE_RAIL_${side < 0 ? 'LEFT' : 'RIGHT'}_${counts.windmillCircle}`,
              {
                type: 'toy-park-windmill-spinner-circle-light-purple-transition-side-rail',
                railSide: side,
                transitionZone: zone,
                approachExitSideRail: true,
                noRailInsideSpinnerCircle: true,
                stopsAtCircleOpening: true,
                length: Number(approachSurfaceOverhang.toFixed(3)),
                xOffset: Number(transitionRailX.toFixed(3)),
                purpose: 'left-right-half-round-rails-only-on-purple-approach-and-exit-surfaces-before-the-circle',
              }
            );
            group.add(rail);
            transitionSideRailCount += 1;
          });
        });
        // Keep the big circular rail open at the local -Z/+Z entrance/exit direction.
        // The straight light-purple road surface passes through those openings, but side rails
        // must NOT run inside the spinner circle; the only interior moving shape is the windmill X.
        // The rail center sits inside the circular board so the half-round's outer lip is flush
        // with the board edge instead of protruding outside the circle.
        const circleOpeningAngle = Math.PI * 0.26;
        const sideArcAngle = Math.PI - circleOpeningAngle;
        const circleRailMajorRadius = Math.max(0.1, circleRadius - halfRoundRailRadius * 1.18);
        let circleRailEndCapCount = 0;
        const makeCircleArcRailSamples = (centerAngle, arcAngle) => {
          const segmentCount = 52;
          const startAngle = centerAngle - arcAngle / 2;
          const samples = [];
          for (let i = 0; i <= segmentCount; i += 1) {
            const angle = startAngle + arcAngle * (i / segmentCount);
            const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            samples.push({
              center: new THREE.Vector3(radial.x * circleRailMajorRadius, halfRoundRailBaseY, radial.z * circleRailMajorRadius),
              right: radial,
              y: halfRoundRailBaseY,
            });
          }
          return samples;
        };
        [
          { side: 'right', centerAngle: 0 },
          { side: 'left', centerAngle: Math.PI },
        ].forEach(({ side, centerAngle }) => {
          const rail = makeLocalHalfRoundRail(
            makeCircleArcRailSamples(centerAngle, sideArcAngle),
            `TOY_PARK_WINDMILL_SPINNER_CIRCLE_LIGHT_PURPLE_OPEN_SIDE_HALF_ROUND_ARC_RAIL_${side}_${counts.windmillCircle}`,
            {
              type: 'toy-park-windmill-spinner-circle-light-purple-open-side-arc-rail',
              circularRail: true,
              fullCircleRail: false,
              sideArcRail: true,
              arcSide: side,
              openingAtEntranceAndExit: true,
              openingAxis: 'local-z-entrance-exit',
              entranceExitGapCenters: ['local-negative-z', 'local-positive-z'],
              connectedByRibbonRails: false,
              connectedByStraightRoadSurface: true,
              connectorPolicy: 'circle-rail-open-at-local-z-for-straight-road-surface-no-rails-inside-spinner',
              bladeClearanceTarget: 'spinner-blades-stop-before-this-rail',
              insetCircleRail: true,
              circleRailMajorRadius: Number(circleRailMajorRadius.toFixed(3)),
              circleBoardRadius: Number(circleRadius.toFixed(3)),
            }
          );
          group.add(rail);
          // Half-round rail geometry already has flat capped ends like other Toy Park rails.
          // Keep the debug count at zero because separate bulb/sphere caps are intentionally removed.
        });
        group.userData.circleRailEndCapCount = circleRailEndCapCount;
        group.userData.transitionSurfaceCount = transitionSurfaceCount;
        group.userData.transitionSideRailCount = transitionSideRailCount;
        group.userData.transitionSideRailPolicy = 'left-right-rails-only-on-short-approach-and-exit-purple-transition-surfaces-stop-before-circle-opening';
        group.userData.straightSurfaceDepth = Number(passThroughDepth.toFixed(3));
        group.userData.totalPurpleFootprintDepth = Number(totalPurpleFootprintDepth.toFixed(3));
        group.userData.desiredApproachSurfaceOverhang = Number(desiredApproachSurfaceOverhang.toFixed(3));
        group.userData.approachSurfaceOverhang = Number(approachSurfaceOverhang.toFixed(3));
        group.userData.seamMargin = Number(seamMargin.toFixed(3));
        group.userData.clampedToHostPiece = approachSurfaceOverhang < desiredApproachSurfaceOverhang - 0.001;
        group.userData.overlapSafeFootprint = totalPurpleFootprintDepth <= pieceLength - seamMargin * 2 + 0.001;
        group.userData.splitShortTransitionSurfaces = true;
        group.userData.circleRailOpeningAngleRadians = Number(circleOpeningAngle.toFixed(3));
        group.userData.circleRailGapFix = 'rounded-end-caps-on-open-circle-rail-ends-no-inner-rail';
        app.trackGroup.add(group);
      }
      if (isVariableBend || isMintSpikeBend45Draft) counts.variableBend += 1;
      else if (isWindmillCircle) counts.windmillCircle += 1;
      else if (isRampUp) counts.rampUp += 1;
      else if (isElevatedStraight) counts.elevatedStraight += 1;
      else if (isRampDown) counts.rampDown += 1;
      else counts.straight += 1;
    });
    app.trackStats.toyParkRoadTileMarkers = 0;
    app.trackStats.toyParkRoadTileMarkerStyle = 'disabled-user-request-direct-track-board-colors';
    app.trackStats.toyParkRoadTileSurfaceColoring = {
      mode: 'direct-colored-track-board-surfaces-polygon-offset-bend-above-straight-to-avoid-90-degree-seam-z-fighting',
      straightColor: 'sky-blue',
      rampUpColor: null,
      elevatedStraightColor: null,
      rampDownColor: null,
      variableBendColor: 'warm-orange',
      bridgeModuleSurfaceColoring: 'cancelled-no-ramp-up-elevated-ramp-down-bridge-board-surfaces',
      uTurn180Color: null,
      uTurn180Cancelled: true,
      corner45Color: null,
      counts,
      markerOverlayCount: 0,
      physicsPreserved: true,
    };
    app.trackStats.toyParkRoadTileSurfaceColoring.independentBridgeModules = app.toyParkTrackTiles?.independentBridgeModules || null;
    app.trackStats.toyParkRoadTileSurfaceColoring.pathHeightMode = app.toyParkTrackTiles?.independentBridgeModules?.pathHeightMode || null;
  
}

export function getToyParkRailCurveRole(app, distance, side) {
    const span = 3.2;
    const back = app.getTrackFrameAt(clamp(distance - span, 0, app.trackLength)).horizontalTangent;
    const ahead = app.getTrackFrameAt(clamp(distance + span, 0, app.trackLength)).horizontalTangent;
    const curveCrossY = (back.x * ahead.z) - (back.z * ahead.x);
    const curveMagnitude = Math.abs(curveCrossY);
    if (curveMagnitude < 0.015) {
      return side > 0 ? 'outer' : 'inner';
    }
    const outerSide = curveCrossY > 0 ? 1 : -1;
    return side === outerSide ? 'outer' : 'inner';
  
}

export function getToyParkTileRailCurveRole(app, piece, distance, side) {
    return {
      role: getToyParkRailCurveRole(app, distance, side),
      source: 'sampled-local-tangent-cross-fallback',
      outerSide: null,
      turnDegrees: piece?.turnDegrees ?? null,
    };
  
}

export function measureToyParkRailCurveLength(samples) {
    let length = 0;
    for (let i = 1; i < samples.length; i += 1) {
      length += samples[i - 1].center.distanceTo(samples[i].center);
    }
    return length;
  
}

export function buildToyParkRailCurve(app, startD, endD, side, width, railOffset, railBaseLift) {
    const samples = [];
    const segmentCount = Math.max(3, Math.ceil((endD - startD) / 0.38));
    for (let i = 0; i <= segmentCount; i += 1) {
      const d = lerp(startD, endD, i / segmentCount);
      const base = app.getTrackPointAt(d);
      const frame = app.getTrackFrameAt(d);
      const localWidth = base.w ?? app.getTrackWidthAt(d) ?? width;
      samples.push({
        d,
        center: new THREE.Vector3(
          base.x + frame.right.x * side * (localWidth / 2 + railOffset),
          base.y + railBaseLift,
          base.z + frame.right.z * side * (localWidth / 2 + railOffset)
        ),
        right: frame.right.clone(),
        y: base.y + railBaseLift,
      });
    }
    return samples;
  
}

export function buildToyParkHalfRoundRailMesh(app, samples, radius, material, name, userData) {
    const crossSegments = 10;
    const vertices = [];
    const indices = [];
    samples.forEach((sample) => {
      // Low curb profile: flat bottom lies on the track plane, rounded half only rises upward.
      // Cross-section is across the track width (sample.right), extrusion follows track distance.
      for (let j = 0; j <= crossSegments; j += 1) {
        const theta = Math.PI - (Math.PI * j / crossSegments);
        const lateral = Math.cos(theta) * radius;
        const height = Math.max(0, Math.sin(theta) * radius);
        const p = sample.center.clone()
          .add(sample.right.clone().multiplyScalar(lateral));
        p.y = sample.y + height;
        vertices.push(p.x, p.y, p.z);
      }
    });
    const row = crossSegments + 1;
    for (let i = 0; i < samples.length - 1; i += 1) {
      for (let j = 0; j < crossSegments; j += 1) {
        const a = i * row + j;
        const b = a + 1;
        const c = (i + 1) * row + j;
        const d = c + 1;
        // Winding faces outward/upward; previous winding made the half-round look rotated/inverted.
        indices.push(a, b, c, b, d, c);
      }
      // Flat base cap so the rail reads as a half-round curb sitting on the track,
      // not as an open arch with legs visually dipping into the ground.
      const leftA = i * row;
      const rightA = i * row + crossSegments;
      const leftB = (i + 1) * row;
      const rightB = (i + 1) * row + crossSegments;
      indices.push(leftA, leftB, rightA, rightA, leftB, rightB);
    }
    if (samples.length > 1) {
      const start = 0;
      const end = (samples.length - 1) * row;
      for (let j = 1; j < crossSegments; j += 1) {
        // Solid end caps prevent striped chunks from looking like upright/open slices at joins.
        indices.push(start, start + j + 1, start + j);
        indices.push(end, end + j, end + j + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = shadowsEnabled(app);
    mesh.receiveShadow = shadowsEnabled(app);
    mesh.userData = {
      ...userData,
      halfRound: true,
      grounded: true,
      railProfile: 'large-30pct-smaller-semi-circular-curb-flat-bottom-upward-on-track',
      railBottomY: Number(Math.min(...samples.map((sample) => sample.y)).toFixed(3)),
      railTopY: Number((Math.max(...samples.map((sample) => sample.y)) + radius).toFixed(3)),
    };
    return mesh;
  
}

export function createToyParkRailClayTexture(app, sourceMaterial = null) {
    const clayRailTexture = sourceMaterial?.map?.clone
      ? sourceMaterial.map.clone()
      : app.createNeonRubberTexture(app.getWorldVisualThemeStyle().rail);
    clayRailTexture.repeat?.set?.(3.1, 1.35);
    clayRailTexture.userData = {
      ...(clayRailTexture.userData || {}),
      role: 'toy-park-curb-clay-grain',
      clayGrain: 'heavy-pitted-molded-plastic',
      sharpRedWhiteRailPalette: true,
    };
    return clayRailTexture;
  
}

export function createToyParkRailMaterialSet(app, sourceMaterial = null) {
    const clayRailTexture = createToyParkRailClayTexture(app, sourceMaterial);
    const red = new THREE.MeshPhysicalMaterial({
      color: 0xff1f2d,
      map: clayRailTexture,
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.62,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const white = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: clayRailTexture,
      roughness: 0.74,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.66,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const innerGray = new THREE.MeshPhysicalMaterial({
      color: 0xaeb7ba,
      // Inner bend rail should read as one smooth molded gray curb, not as textured/striped chunks.
      map: null,
      roughness: 0.94,
      metalness: 0,
      clearcoat: 0.025,
      clearcoatRoughness: 0.96,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const straightBlue = new THREE.MeshPhysicalMaterial({
      color: 0x8fd8ff,
      map: clayRailTexture,
      roughness: 0.84,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.86,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const candyPopPinkOrange = new THREE.MeshPhysicalMaterial({
      color: 0xffb07c,
      map: clayRailTexture,
      roughness: 0.86,
      metalness: 0,
      clearcoat: 0.05,
      clearcoatRoughness: 0.88,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    red.userData = { ...(red.userData || {}), type: 'toy-park-rail-red-material', sharedToyParkRailTexture: true, opaqueDoubleSidedRail: true, brighterToyRailPalette: true, sharpRedWhiteRailPalette: true };
    white.userData = { ...(white.userData || {}), type: 'toy-park-rail-white-material', sharedToyParkRailTexture: true, opaqueDoubleSidedRail: true, brighterToyRailPalette: true, sharpRedWhiteRailPalette: true };
    innerGray.userData = { ...(innerGray.userData || {}), type: 'toy-park-rail-inner-gray-material', smoothUntexturedContinuousGray: true, sharedToyParkRailTexture: false, opaqueDoubleSidedRail: true, brighterToyRailPalette: false };
    straightBlue.userData = { ...(straightBlue.userData || {}), type: 'toy-park-straight-road-tile-rail-sky-blue-material', sharedToyParkRailTexture: true, opaqueDoubleSidedRail: true, straightRoadTileRail: true, matchesStraightTrackSurfaceColor: true, tileRailColor: 'sky-blue' };
    candyPopPinkOrange.userData = { ...(candyPopPinkOrange.userData || {}), type: 'toy-park-candy-pop-straight-obstacle-tile-rail-pink-orange-material', sharedToyParkRailTexture: true, opaqueDoubleSidedRail: true, straightRoadTileRail: true, obstacleTileRail: true, matchesStraightTrackSurfaceColor: true, tileRailColor: 'pink-orange', materialFeel: 'rough pitted molded clay half-round rail matching candy pop obstacle tile surface' };
    return { red, white, innerGray, straightBlue, candyPopPinkOrange, clayRailTexture };
  
}

export function createToyParkStartRailPastelMaterialSet(app, sourceMaterial = null) {
    const { canvas, ctx } = app.createTextureCanvas(512, '#f4ceda');
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#ffe1ea');
    grad.addColorStop(0.44, '#e9c4d6');
    grad.addColorStop(1, '#d4c2e8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 1) {
      const smear = Math.sin(y * 0.06) * 14 + Math.sin(y * 0.19) * 6;
      ctx.fillStyle = `rgba(255,248,238,${0.028 + Math.max(0, smear) * 0.0007})`;
      ctx.fillRect(0, y, 512, 1);
      ctx.fillStyle = `rgba(95,70,86,${0.045 + Math.max(0, -smear) * 0.0015})`;
      ctx.fillRect(0, y + 1, 512, 1);
    }
    for (let i = 0; i < 1700; i += 1) {
      const x = (i * 89 + 31) % 512;
      const y = (i * 167 + 47) % 512;
      const r = 0.7 + (i % 7) * 0.36;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(92,66,82,0.115)' : 'rgba(255,248,232,0.17)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(108,78,95,0.08)';
    ctx.lineWidth = 5;
    for (let y = 20; y < 512; y += 42) {
      ctx.beginPath();
      ctx.moveTo(-20, y);
      for (let x = 0; x <= 540; x += 28) ctx.lineTo(x, y + Math.sin(x * 0.052 + y) * 5);
      ctx.stroke();
    }
    const pastelRailTexture = app.finishTexture(canvas, 3.2, 1.65);
    pastelRailTexture.userData = {
      role: 'toy-park-opaque-brighter-pastel-clay-grain',
      clayGrain: 'lighter-pitted-molded-plastic-matte',
      strongerClayGrain: true,
      transparentTexture: false,
      source: 'brighter-pastel-clay-canvas-not-main-rail-clone',
      sourceMaterialStyle: sourceMaterial?.userData?.style || null,
    };
    const swatches = [
      { key: 'pastel-pink', family: '粉紅', color: 0xff92c9, roughness: 0.91, clearcoat: 0.04, clearcoatRoughness: 0.92 },
      { key: 'pastel-blue', family: '粉藍', color: 0x9edcff, roughness: 0.92, clearcoat: 0.035, clearcoatRoughness: 0.93 },
      { key: 'pastel-purple', family: '粉紫', color: 0xd2b2ff, roughness: 0.92, clearcoat: 0.035, clearcoatRoughness: 0.93 },
      { key: 'cream-white', family: '白', color: 0xffefd8, roughness: 0.93, clearcoat: 0.03, clearcoatRoughness: 0.94 },
      { key: 'pastel-green', family: '粉綠', color: 0xa8edba, roughness: 0.92, clearcoat: 0.035, clearcoatRoughness: 0.93 },
    ];
    const materials = swatches.map((swatch, index) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: swatch.color,
        map: pastelRailTexture,
        roughness: swatch.roughness,
        metalness: 0,
        clearcoat: swatch.clearcoat,
        clearcoatRoughness: swatch.clearcoatRoughness,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      material.userData = {
        type: 'toy-park-start-board-side-rail-pastel-material',
        sharedToyParkRailTexture: true,
        startRailPastelPalette: true,
        startRailPinkPalette: false,
        paletteFamily: swatch.family,
        paletteKey: swatch.key,
        paletteIndex: index,
        noAdjacentRepeatPalette: true,
        opaqueClay: true,
        brighterToyRailPalette: true,
        transparentTexture: false,
      };
      return material;
    });
    return { materials, pastelRailTexture, paletteKeys: swatches.map((swatch) => swatch.key), paletteFamilies: swatches.map((swatch) => swatch.family) };
  
}

export function addToyParkMarbleGuardRails(app, points, material, width) {
    // Large toy-playset curb preview: 30% smaller than the oversized 1.12 test rail,
    // keeping a chunky half-round clay feel while reducing the wall-like scale.
    const railRadius = 0.784;
    const railBaseLift = 0.006;
    const railOffset = 0.392;
    const chunkLength = 1.45;
    const railChunkGap = 0.035;
    const tileConnectorOverlap = TOY_PARK_RAIL_TILE_CONNECTOR_OVERLAP;
    const { red: redMaterial, white: whiteMaterial, innerGray: innerGrayMaterial, straightBlue: straightBlueMaterial, candyPopPinkOrange: candyPopPinkOrangeMaterial } = createToyParkRailMaterialSet(app, material);
    const mintSpikeGreenMaterial = new THREE.MeshPhysicalMaterial({ color: 0x98f2c6, roughness: 0.9, metalness: 0, clearcoat: 0.04, clearcoatRoughness: 0.92, transparent: false, opacity: 1, side: THREE.DoubleSide });
    mintSpikeGreenMaterial.userData = { type: 'toy-park-mint-chocolate-spike-45-bend-render-ready-tile-rail-material', tileRailColor: 'mint-green', draftTile: false, renderReadyTile: true, matchesMintSpikeBendSurfaceColor: true, opaqueClay: true, materialFeel: 'rough pitted molded clay half-round rail matching mint green chocolate spike bend surface' };
    const windmillLightPurpleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd8bdff,
      roughness: 0.88,
      metalness: 0,
      clearcoat: 0.04,
      clearcoatRoughness: 0.9,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    windmillLightPurpleMaterial.userData = { type: 'toy-park-windmill-spinner-circle-tile-rail-light-purple-material', sharedToyParkRailTexture: false, opaqueDoubleSidedRail: true, circleObstacleTileRail: true, matchesWindmillSpinnerCircleSurfaceColor: true, tileRailColor: 'light-purple', materialFeel: 'rough pitted molded clay half-round rail matching windmill spinner circle tile surface' };
    const makeBridgeRailMaterial = (color, role) => {
      const bridgeMat = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.86,
        metalness: 0,
        clearcoat: 0.05,
        clearcoatRoughness: 0.9,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
      });
      bridgeMat.userData = {
        type: `toy-park-${role}-bridge-board-rail-material`,
        opaqueClay: true,
        transparentTexture: false,
        role: `toy-park-${role}-bridge-board-half-round-rail-matches-board-surface`,
        materialFeel: 'rough pitted molded clay-plastic bridge board rail',
      };
      return bridgeMat;
    };
    const bridgeRailMaterials = new Map([
      [TOY_PARK_TRACK_TILE_LIBRARY.rampUp.key, makeBridgeRailMaterial(0x95f0c8, 'ramp-up')],
      [TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.key, makeBridgeRailMaterial(0xcdb7ff, 'elevated-straight')],
      [TOY_PARK_TRACK_TILE_LIBRARY.rampDown.key, makeBridgeRailMaterial(0x95f0c8, 'ramp-down')],
    ]);
    const radialSegments = Math.max(10, app.performanceProfile?.railTubeRadialSegments ?? PERFORMANCE_TUNING.railTubeRadialSegments ?? 10);
    let stripedOuterRailChunks = 0;
    let grayInnerRailChunks = 0;
    let ninetyDegreeInnerRailRemoved = 0;
    let ninetyDegreeOuterRailChunks = 0;
    let straightBlueRailSegments = 0;
    let windmillHostStraightRailSegments = 0;
    let bridgeBoardRailSegments = 0;
    let rampUpBridgeRailSegments = 0;
    let elevatedBridgeRailSegments = 0;
    let rampDownBridgeRailSegments = 0;
    let tileConnectorRailSegments = 0;
    let windmillBoundaryJoinConnectorSkipped = 0;
    const bendRailRoleSummary = [];
    const straightPieces = (app.trackPieces || [])
      .filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.straight.key
        || piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.candyPopStraightObstacle?.key
        || piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.candyRampStraightDraft?.key
        || piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.windmillSpinnerCircle?.key);
    const bridgeTileKeys = new Set([
      TOY_PARK_TRACK_TILE_LIBRARY.rampUp.key,
      TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.key,
      TOY_PARK_TRACK_TILE_LIBRARY.rampDown.key,
    ]);
    const bridgePieces = (app.trackPieces || [])
      .filter((piece) => bridgeTileKeys.has(piece.tileKey));
    const bendTileKeys = new Set([
      TOY_PARK_TRACK_TILE_LIBRARY.variableBend.key,
      TOY_PARK_TRACK_TILE_LIBRARY.mintSpikeBend45Draft?.key,
    ]);
    const bendPieces = (app.trackPieces || [])
      .filter((piece) => bendTileKeys.has(piece.tileKey));
    const innerBendJoinSides = new Map();
    const ninetyDegreeBendBoundaries = new Set();
    const boundaryKey = (distance) => Number(distance).toFixed(3);
    const windmillBoundaryDistances = new Set();
    (app.trackPieces || [])
      .filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.windmillSpinnerCircle?.key)
      .forEach((piece) => {
        if (Number.isFinite(piece.startD) && piece.startD > 0 && piece.startD < app.trackLength) windmillBoundaryDistances.add(boundaryKey(piece.startD));
        if (Number.isFinite(piece.endD) && piece.endD > 0 && piece.endD < app.trackLength) windmillBoundaryDistances.add(boundaryKey(piece.endD));
      });
    const isWindmillBoundary = (distance) => windmillBoundaryDistances.has(boundaryKey(distance));
    const markNinetyDegreeBendBoundary = (distance) => {
      if (!Number.isFinite(distance) || distance <= 0 || distance >= app.trackLength) return;
      ninetyDegreeBendBoundaries.add(boundaryKey(distance));
    };
    const isNinetyDegreeBendBoundary = (distance) => ninetyDegreeBendBoundaries.has(boundaryKey(distance));
    const markInnerBendJoinSide = (distance, side) => {
      if (!Number.isFinite(distance) || distance <= 0 || distance >= app.trackLength) return;
      innerBendJoinSides.set(`${boundaryKey(distance)}:${side}`, true);
    };
    bendPieces.forEach((piece) => {
      const isNinetyDegreeBend = Math.abs(Number(piece.turnDegrees || 0)) === 90;
      if (isNinetyDegreeBend) {
        markNinetyDegreeBendBoundary(piece.startD);
        markNinetyDegreeBendBoundary(piece.endD);
      }
      const pieceStart = clamp(piece.startD - (isNinetyDegreeBend ? 0 : tileConnectorOverlap), 0, app.trackLength);
      const pieceEnd = clamp(piece.endD + (isNinetyDegreeBend ? 0 : tileConnectorOverlap), pieceStart, app.trackLength);
      const sideSummaries = [-1, 1].map((bendSide) => {
        const fullSamples = buildToyParkRailCurve(app, pieceStart, pieceEnd, bendSide, width, railOffset, railBaseLift);
        return { side: bendSide, railPathLength: measureToyParkRailCurveLength(fullSamples) };
      });
      const [firstSide, secondSide] = sideSummaries;
      const outerSide = firstSide.railPathLength >= secondSide.railPathLength ? firstSide.side : secondSide.side;
      const innerSide = outerSide === -1 ? 1 : -1;
      markInnerBendJoinSide(piece.startD, innerSide);
      markInnerBendJoinSide(piece.endD, innerSide);
    });
    let grayInnerJoinConnectorSegments = 0;
    let ninetyDegreeJoinConnectorSkipped = 0;
    let straightBlueNinetyDegreeBoundaryClips = 0;
    [-1, 1].forEach((side) => {
      straightPieces.forEach((piece) => {
        const startTouchesInnerGray = innerBendJoinSides.has(`${boundaryKey(piece.startD)}:${side}`);
        const endTouchesInnerGray = innerBendJoinSides.has(`${boundaryKey(piece.endD)}:${side}`);
        const startTouchesNinetyDegreeBend = isNinetyDegreeBendBoundary(piece.startD);
        const endTouchesNinetyDegreeBend = isNinetyDegreeBendBoundary(piece.endD);
        const baseStartD = clamp(piece.startD - ((startTouchesInnerGray || startTouchesNinetyDegreeBend) ? 0 : tileConnectorOverlap), 0, app.trackLength);
        const baseEndD = clamp(piece.endD + ((endTouchesInnerGray || endTouchesNinetyDegreeBend) ? 0 : tileConnectorOverlap), baseStartD, app.trackLength);
        if (startTouchesNinetyDegreeBend || endTouchesNinetyDegreeBend) {
          straightBlueNinetyDegreeBoundaryClips += 1;
        }
        const isCandyPopStraight = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.candyPopStraightObstacle?.key;
        const isCandyRampDraft = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.candyRampStraightDraft?.key;
        const isWindmillCircle = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.windmillSpinnerCircle?.key;
        const straightRailMaterial = isCandyPopStraight ? candyPopPinkOrangeMaterial : straightBlueMaterial;
        const straightRailColorName = isCandyPopStraight ? 'pink-orange' : (isCandyRampDraft ? 'sky-blue-ramp-render-ready' : 'sky-blue');
        let railSpans = [{ startD: baseStartD, endD: baseEndD, spanRole: 'full-straight' }];
        if (isWindmillCircle) {
          const midD = (piece.startD + piece.endD) / 2;
          const midPoint = app.getTrackPointAt(midD);
          const localWidth = midPoint.w ?? app.getTrackWidthAt(midD) ?? width;
          const circleDiameter = localWidth * 1.95;
          const desiredApproachSurfaceOverhang = Math.max(1.7, Math.min(localWidth * 0.3, railRadius * 2.25));
          const seamMargin = Math.max(0.24, railRadius * 0.22);
          const pieceLength = Math.max(0, piece.endD - piece.startD);
          const maxApproachSurfaceOverhang = Math.max(0, (pieceLength - seamMargin * 2 - circleDiameter) / 2);
          const approachSurfaceOverhang = Math.max(0, Math.min(desiredApproachSurfaceOverhang, maxApproachSurfaceOverhang));
          const protectedHalfDepth = (circleDiameter + approachSurfaceOverhang * 2) / 2;
          const protectedStartD = clamp(midD - protectedHalfDepth - seamMargin * 0.25, piece.startD, piece.endD);
          const protectedEndD = clamp(midD + protectedHalfDepth + seamMargin * 0.25, piece.startD, piece.endD);
          railSpans = [
            { startD: baseStartD, endD: protectedStartD, spanRole: 'windmill-host-before-circle' },
            { startD: protectedEndD, endD: baseEndD, spanRole: 'windmill-host-after-circle' },
          ].filter((span) => span.endD - span.startD > 0.35);
        }
        railSpans.forEach((span) => {
          const samples = buildToyParkRailCurve(app, span.startD, span.endD, side, width, railOffset, railBaseLift);
          const tube = buildToyParkHalfRoundRailMesh(app,
            samples,
            railRadius,
            straightRailMaterial,
            `toy-park-half-round-straight-${straightRailColorName}-continuous-rail-${side < 0 ? 'left' : 'right'}-${straightBlueRailSegments}`,
            {
              type: isWindmillCircle ? 'toy-park-windmill-host-straight-sky-blue-split-rail' : (isCandyPopStraight ? 'toy-park-candy-pop-straight-obstacle-tile-pink-orange-continuous-rail' : (isCandyRampDraft ? 'toy-park-candy-ramp-straight-render-ready-tile-sky-blue-continuous-rail' : 'toy-park-straight-road-tile-sky-blue-continuous-rail')),
              railSide: side,
              curveRole: isWindmillCircle ? 'windmill-host-straight-split-before-after-circle' : 'straight-continuous',
              railSpanRole: span.spanRole,
              tileKey: piece.tileKey,
              tileLabel: piece.tileLabel,
              straightRoadTileRail: true,
              candyPopObstacleTileRail: isCandyPopStraight,
              candyRampRenderReadyTileRail: isCandyRampDraft,
              windmillHostStraightRail: isWindmillCircle,
              windmillCircleTileRail: false,
              avoidsWindmillCircleInterior: isWindmillCircle,
              continuousRail: true,
              segmentedChunks: false,
              distanceStart: Number(span.startD.toFixed(2)),
              distanceEnd: Number(span.endD.toFixed(2)),
              tileRailConnectorOverlap: isWindmillCircle ? 0 : tileConnectorOverlap,
              clippedAtInnerGrayBoundary: startTouchesInnerGray || endTouchesInnerGray,
              clippedAtNinetyDegreeBendBoundary: startTouchesNinetyDegreeBend || endTouchesNinetyDegreeBend,
              clippedAroundWindmillCircle: isWindmillCircle,
              startTouchesInnerGray,
              endTouchesInnerGray,
              startTouchesNinetyDegreeBend,
              endTouchesNinetyDegreeBend,
              railJoinFix: isWindmillCircle
                ? 'windmill-host-straight-blue-rails-restored-before-and-after-circle-but-clipped-away-from-spinner-interior'
                : ((startTouchesNinetyDegreeBend || endTouchesNinetyDegreeBend)
                  ? 'straight-blue-rail-stops-flush-at-90-degree-bend-boundary-to-avoid-neighbor-board-rail-overlap'
                  : ((startTouchesInnerGray || endTouchesInnerGray)
                    ? 'straight-blue-rail-stops-flush-at-inner-gray-bend-boundary-to-avoid-overlap-collar'
                    : 'overlap-straight-rail-slightly-across-non-90-tile-boundaries')),
              materialFeel: isCandyPopStraight
                ? 'single continuous pink-orange rough clay half-round rail matching the candy pop straight obstacle tile surface'
                : (isCandyRampDraft
                  ? 'single continuous sky-blue rough clay half-round rail around the render-ready candy ramp terrain tile'
                  : 'single continuous sky-blue rough clay half-round rail matching the straight road tile track surface'),
              cameraOccluder: true,
              cameraOccluderType: isWindmillCircle ? 'toy-park-windmill-host-straight-sky-blue-split-rail' : 'toy-park-straight-road-tile-sky-blue-continuous-rail',
              cameraOccluderDistanceStart: span.startD,
              cameraOccluderDistanceEnd: span.endD,
            }
          );
          app.trackGroup.add(tube);
          straightBlueRailSegments += 1;
          if (isWindmillCircle) windmillHostStraightRailSegments += 1;
        });
      });

      bridgePieces.forEach((piece) => {
        const startD = clamp(piece.startD, 0, app.trackLength);
        const endD = clamp(piece.endD, startD, app.trackLength);
        const samples = buildToyParkRailCurve(app, startD, endD, side, width, railOffset, railBaseLift);
        const role = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampUp.key
          ? 'ramp-up'
          : piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.key
            ? 'elevated-straight'
            : 'ramp-down';
        const railMaterial = bridgeRailMaterials.get(piece.tileKey) || straightBlueMaterial;
        const tube = buildToyParkHalfRoundRailMesh(app,
          samples,
          railRadius,
          railMaterial,
          `toy-park-half-round-${role}-bridge-board-rail-${side < 0 ? 'left' : 'right'}-${bridgeBoardRailSegments}`,
          {
            type: `toy-park-${role}-bridge-board-half-round-rail`,
            railSide: side,
            curveRole: `${role}-bridge-board-continuous`,
            tileKey: piece.tileKey,
            tileLabel: piece.tileLabel,
            bridgeBoardRail: true,
            bridgeModule: true,
            bridgeModuleRole: piece.bridgeModuleRole ?? null,
            elevationRole: piece.elevationRole ?? null,
            bridgeHeight: piece.bridgeHeight ?? 0,
            continuousRail: true,
            segmentedChunks: false,
            distanceStart: Number(startD.toFixed(2)),
            distanceEnd: Number(endD.toFixed(2)),
            tileRailConnectorOverlap: 0,
            railJoinFix: 'bridge-board-rails-restored-for-ramp-up-elevated-and-ramp-down-modules-with-flush-tile-boundaries',
            materialFeel: `${role} bridge board has continuous rough molded-clay half-round side rail matching the bridge surface`,
            cameraOccluder: true,
            cameraOccluderType: 'toy-park-bridge-board-half-round-rail',
            cameraOccluderDistanceStart: startD,
            cameraOccluderDistanceEnd: endD,
          }
        );
        app.trackGroup.add(tube);
        bridgeBoardRailSegments += 1;
        if (piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampUp.key) rampUpBridgeRailSegments += 1;
        else if (piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.key) elevatedBridgeRailSegments += 1;
        else if (piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampDown.key) rampDownBridgeRailSegments += 1;
      });

    const tileBoundaries = (app.trackPieces || [])
        .filter((piece) => piece.tileKey)
        .map((piece) => piece.endD)
        .filter((distance) => distance > 0 && distance < app.trackLength);
      tileBoundaries.forEach((boundaryD) => {
        const startD = clamp(boundaryD - tileConnectorOverlap, 0, app.trackLength);
        const endD = clamp(boundaryD + tileConnectorOverlap, startD, app.trackLength);
        const innerBendJoin = innerBendJoinSides.has(`${boundaryKey(boundaryD)}:${side}`);
        const ninetyDegreeBendJoin = isNinetyDegreeBendBoundary(boundaryD);
        const windmillBoundaryJoin = isWindmillBoundary(boundaryD);
        if (innerBendJoin || ninetyDegreeBendJoin || windmillBoundaryJoin) {
          if (windmillBoundaryJoin) {
            windmillBoundaryJoinConnectorSkipped += 1;
          } else if (ninetyDegreeBendJoin) {
            ninetyDegreeJoinConnectorSkipped += 1;
          } else {
            grayInnerJoinConnectorSegments += 1;
          }
          return;
        }
        const samples = buildToyParkRailCurve(app, startD, endD, side, width, railOffset, railBaseLift + 0.012);
        const connector = buildToyParkHalfRoundRailMesh(app,
          samples,
          railRadius * 1.015,
          straightBlueMaterial,
          `toy-park-half-round-tile-join-connector-${side < 0 ? 'left' : 'right'}-${tileConnectorRailSegments}`,
          {
            type: 'toy-park-rail-tile-join-connector',
            railSide: side,
            curveRole: 'tile-boundary-connector-cap',
            distanceStart: Number(startD.toFixed(2)),
            distanceEnd: Number(endD.toFixed(2)),
            tileRailConnectorOverlap: tileConnectorOverlap,
            railJoinFix: 'short-molded-connector-cap-bridges-non-inner-gray-rail-angle-step-between-modular-tiles',
            connectorAtDistance: Number(boundaryD.toFixed(2)),
            continuousRail: true,
            segmentedChunks: false,
            innerBendJoinSkipped: false,
            materialFeel: 'short sky-blue molded connector cap hiding hard rail seam between non-inner-gray road tile joins',
          }
        );
        app.trackGroup.add(connector);
        tileConnectorRailSegments += 1;
      });
    });

    let stripeIndex = 0;
      bendPieces.forEach((piece) => {
        const isNinetyDegreeBend = Math.abs(Number(piece.turnDegrees || 0)) === 90;
        const isMintSpikeBend45Draft = piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.mintSpikeBend45Draft?.key;
        const pieceStart = clamp(piece.startD - (isNinetyDegreeBend ? 0 : tileConnectorOverlap), 0, app.trackLength);
        const pieceEnd = clamp(piece.endD + (isNinetyDegreeBend ? 0 : tileConnectorOverlap), pieceStart, app.trackLength);
        const sideSummaries = [-1, 1].map((bendSide) => {
          const fullSamples = buildToyParkRailCurve(app, pieceStart, pieceEnd, bendSide, width, railOffset, railBaseLift);
          const railPathLength = measureToyParkRailCurveLength(fullSamples);
          return {
            side: bendSide,
            samples: fullSamples,
            railPathLength,
          };
        });
        const [firstSide, secondSide] = sideSummaries;
        const outerSide = firstSide.railPathLength >= secondSide.railPathLength ? firstSide.side : secondSide.side;
        const innerSide = outerSide === -1 ? 1 : -1;
        const sideLengthMap = sideSummaries.reduce((map, entry) => {
          map[entry.side] = Number(entry.railPathLength.toFixed(3));
          return map;
        }, {});

        sideSummaries.forEach((sideSummary) => {
          const bendSide = sideSummary.side;
          const role = bendSide === outerSide ? 'outer' : 'inner';
          if (role === 'inner') {
            const pieceTurnDegrees = Number(piece.turnDegrees || 0);
            const isNinetyDegreeBend = Math.abs(pieceTurnDegrees) === 90;
            const innerFlushSamples = buildToyParkRailCurve(app, piece.startD, piece.endD, bendSide, width, railOffset, railBaseLift);
            const innerFlushRailPathLength = measureToyParkRailCurveLength(innerFlushSamples);
            const tube = buildToyParkHalfRoundRailMesh(app,
              innerFlushSamples,
              railRadius,
              isMintSpikeBend45Draft ? mintSpikeGreenMaterial : innerGrayMaterial,
              `toy-park-half-round-inner-smooth-gray-continuous-rail-${bendSide < 0 ? 'left' : 'right'}-${grayInnerRailChunks}`,
              {
                type: 'toy-park-gray-inner-rail',
                railSide: bendSide,
                curveRole: 'inner',
                curveSideRole: 'inner-shorter-rail',
                curveRoleSource: 'measured-rail-polyline-length-shorter-side',
                outerCurveRail: false,
                innerCurveRail: true,
                outerSide,
                innerSide,
                railPathLength: Number(innerFlushRailPathLength.toFixed(3)),
                oppositeRailPathLength: Number(sideLengthMap[outerSide].toFixed(3)),
                railLengthComparison: sideLengthMap,
                tileKey: piece.tileKey || null,
                tileLabel: piece.tileLabel || null,
                pieceTurnDegrees: piece.turnDegrees ?? null,
                bendRailStyle: 'inner-bend-one-continuous-smooth-gray-half-round-rail-no-chunks',
                straightRoadTileRail: false,
                continuousRail: true,
                segmentedChunks: false,
                distanceStart: Number(piece.startD.toFixed(2)),
                distanceEnd: Number(piece.endD.toFixed(2)),
                tileRailConnectorOverlap: 0,
                innerRailFlushButtJoint: true,
                railJoinFix: 'inner-short-side-generated-as-one-continuous-smooth-gray-rail-length-based-role',
                draftMintSpikeBendRail: isMintSpikeBend45Draft,
                railAndTrackColor: isMintSpikeBend45Draft ? 'mint-green' : null,
                materialFeel: isMintSpikeBend45Draft
                  ? 'mint green one-piece rough molded-clay half-round rail matching the render-ready chocolate pop-up spike bend surface'
                  : (isNinetyDegreeBend
                    ? 'large 30%-smaller one-piece smooth gray molded-clay half-round rail restored on the shorter inside of the 90-degree bend by user request; flush butt joints preserved at tile boundaries'
                    : 'large 30%-smaller one-piece smooth gray molded-clay half-round rail on the shorter inside of the variable-angle bend; 180-degree U-turn tile cancelled'),
                cameraOccluder: true,
                cameraOccluderType: 'toy-park-gray-inner-rail',
                cameraOccluderDistanceStart: pieceStart,
                cameraOccluderDistanceEnd: pieceEnd,
              }
            );
            app.trackGroup.add(tube);
            bendRailRoleSummary.push({
              side: bendSide,
              role,
              materialRole: 'smooth-gray-continuous',
              tileKey: piece.tileKey || null,
              turnDegrees: piece.turnDegrees ?? null,
              outerSide,
              innerSide,
              railPathLength: Number(innerFlushRailPathLength.toFixed(3)),
              oppositeRailPathLength: Number(sideLengthMap[outerSide].toFixed(3)),
              distanceStart: Number(piece.startD.toFixed(2)),
              distanceEnd: Number(piece.endD.toFixed(2)),
              chunkIndex: null,
              continuousRail: true,
              segmentedChunks: false,
            });
            grayInnerRailChunks += 1;
            if (isNinetyDegreeBend) {
              ninetyDegreeInnerRailRemoved += 1;
            }
            return;
          }

          const pieceLength = Math.max(0.01, pieceEnd - pieceStart);
          buildFlushChunks(pieceLength, chunkLength, railChunkGap).forEach((chunk) => {
            const startD = pieceStart + chunk.start;
            const endD = pieceStart + chunk.end;
            const samples = buildToyParkRailCurve(app, startD, endD, bendSide, width, railOffset, railBaseLift);
            const railMaterial = stripeIndex % 2 === 0 ? redMaterial : whiteMaterial;
            const tube = buildToyParkHalfRoundRailMesh(app,
              samples,
              railRadius,
              railMaterial,
              `toy-park-half-round-outer-red-white-striped-rail-${bendSide < 0 ? 'left' : 'right'}-${stripedOuterRailChunks}`,
              {
                type: 'toy-park-red-white-outer-rail',
                railSide: bendSide,
                curveRole: 'outer',
                curveSideRole: 'outer-longer-rail',
                curveRoleSource: 'measured-rail-polyline-length-longer-side',
                outerCurveRail: true,
                innerCurveRail: false,
                outerSide,
                innerSide,
                railPathLength: Number(sideSummary.railPathLength.toFixed(3)),
                oppositeRailPathLength: Number(sideLengthMap[innerSide].toFixed(3)),
                railLengthComparison: sideLengthMap,
                tileKey: piece.tileKey || null,
                tileLabel: piece.tileLabel || null,
                pieceTurnDegrees: piece.turnDegrees ?? null,
                bendRailStyle: 'outer-bend-red-white-striped-half-round-rail-longer-side',
                straightRoadTileRail: false,
                continuousRail: false,
                segmentedChunks: true,
                distanceStart: Number(startD.toFixed(2)),
                distanceEnd: Number(endD.toFixed(2)),
                tileRailConnectorOverlap: isNinetyDegreeBend ? 0 : tileConnectorOverlap,
                ninetyDegreeBoundaryFlushButtJoint: isNinetyDegreeBend,
                railJoinFix: isNinetyDegreeBend
                  ? 'outer-90-degree-bend-rail-stops-flush-at-neighbor-board-boundaries-to-avoid-left-right-tile-rail-overlap'
                  : 'outer-long-side-red-white-chunks-inner-short-side-continuous-gray-length-based-role',
                flushTileBoundaryStart: chunk.flushStart,
                flushTileBoundaryEnd: chunk.flushEnd,
                materialFeel: isMintSpikeBend45Draft
                  ? 'red-white striped rough molded-clay half-round rail on the longer outside of the render-ready chocolate pop-up spike bend, matching the formal bend long-side rail palette'
                  : 'large 30%-smaller dense-striped rough clay half-round rail on the longer outside of the variable-angle bend; 180-degree U-turn tile cancelled',
                draftMintSpikeBendRail: isMintSpikeBend45Draft,
                railAndTrackColor: isMintSpikeBend45Draft ? 'red-white-striped-long-side' : null,
                cameraOccluder: true,
                cameraOccluderType: 'toy-park-red-white-outer-rail',
                cameraOccluderDistanceStart: startD,
                cameraOccluderDistanceEnd: endD,
              }
            );
            app.trackGroup.add(tube);
            const isNinetyDegreeOuterRail = Math.abs(Number(piece.turnDegrees || 0)) === 90;
            if (isNinetyDegreeOuterRail) {
              ninetyDegreeOuterRailChunks += 1;
            }
            bendRailRoleSummary.push({
              side: bendSide,
              role,
              materialRole: 'red-white-striped',
              tileKey: piece.tileKey || null,
              turnDegrees: piece.turnDegrees ?? null,
              outerSide,
              innerSide,
              railPathLength: Number(sideSummary.railPathLength.toFixed(3)),
              oppositeRailPathLength: Number(sideLengthMap[innerSide].toFixed(3)),
              distanceStart: Number(startD.toFixed(2)),
              distanceEnd: Number(endD.toFixed(2)),
              tileRailConnectorOverlap: isNinetyDegreeBend ? 0 : tileConnectorOverlap,
              ninetyDegreeBoundaryFlushButtJoint: isNinetyDegreeBend,
              chunkIndex: chunk.chunkIndex,
              continuousRail: false,
              segmentedChunks: true,
            });
            stripedOuterRailChunks += 1;
            stripeIndex += 1;
          });
        });
      });
    app.trackStats.railTubes += stripedOuterRailChunks + grayInnerRailChunks + straightBlueRailSegments + bridgeBoardRailSegments + tileConnectorRailSegments;
    app.trackStats.toyParkMarbleGuardRailBeads = 0;
    app.trackStats.toyParkStripedOuterRailChunks = stripedOuterRailChunks;
    app.trackStats.toyParkGrayInnerRailChunks = grayInnerRailChunks;
    app.trackStats.toyParkBridgeBoardRailSegments = bridgeBoardRailSegments;
    app.trackStats.toyParkRampUpBridgeRailSegments = rampUpBridgeRailSegments;
    app.trackStats.toyParkElevatedBridgeRailSegments = elevatedBridgeRailSegments;
    app.trackStats.toyParkRampDownBridgeRailSegments = rampDownBridgeRailSegments;
    app.trackStats.toyParkBridgeBoardRailStatus = 'ramp-up-elevated-straight-and-ramp-down-bridge-board-side-rails-restored-continuous-half-round-flush-boundaries';
    app.trackStats.toyParkNinetyDegreeInnerRailRestored = true;
    app.trackStats.toyParkNinetyDegreeInnerRailRemoved = false;
    app.trackStats.toyParkNinetyDegreeInnerRailCount = ninetyDegreeInnerRailRemoved;
    app.trackStats.toyParkNinetyDegreeInnerRailRemovedCount = 0;
    app.trackStats.toyParkNinetyDegreeOuterRailCount = ninetyDegreeOuterRailChunks;
    app.trackStats.toyParkNinetyDegreeRailStatus = 'ninety-degree-bend-inner-rail-restored-user-request-flush-butt-joints-kept';
    app.trackStats.toyParkGrayInnerJoinConnectorSegments = 0;
    app.trackStats.toyParkGrayInnerJoinConnectorSkipped = grayInnerJoinConnectorSegments;
    app.trackStats.toyParkStraightBlueRailSegments = straightBlueRailSegments;
    app.trackStats.toyParkWindmillHostStraightRailSegments = windmillHostStraightRailSegments;
    app.trackStats.toyParkWindmillHostStraightRailPolicy = 'sky-blue-straight-rails-restored-before-and-after-windmill-circle-clipped-out-of-spinner-interior';
    app.trackStats.toyParkTileConnectorRailSegments = tileConnectorRailSegments;
    app.trackStats.toyParkWindmillBoundaryJoinConnectorSkipped = windmillBoundaryJoinConnectorSkipped;
    app.trackStats.toyParkWindmillNoInnerRailPolicy = 'straight-purple-road-surface-through-circle-rails-and-connector-caps-stop-at-circle-openings';
    app.trackStats.toyParkNinetyDegreeJoinConnectorSkipped = ninetyDegreeJoinConnectorSkipped;
    app.trackStats.toyParkStraightBlueNinetyDegreeBoundaryClips = straightBlueNinetyDegreeBoundaryClips;
    app.trackStats.toyParkNinetyDegreeBoundaryFlushButtJoint = true;
    app.trackStats.toyParkNinetyDegreeBoundaryOverlapFix = 'straight-blue-rails-and restored-90-degree-inner-gray-rails use flush butt joints at 90-degree tile boundaries; blue connector caps stay skipped to avoid collars';
    app.trackStats.toyParkNinetyDegreeInnerGapFillSegments = 0;
    app.trackStats.toyParkNinetyDegreeInnerGapFillConnectorStyle = 'disabled-after-user-request-restored-full-90-degree-inner-gray-rail';
    app.trackStats.toyParkBlueConnectorSkipsInnerGrayJoins = true;
    app.trackStats.toyParkStraightBlueRailChunks = 0;
    app.trackStats.toyParkStraightRailSegmentedChunks = false;
    app.trackStats.toyParkStraightRailStyle = 'single-continuous-sky-blue-rail-per-side';
    app.trackStats.visualRailSmoothing = 'large-30pct-smaller-grounded-half-round-dense-striped-clay-toy-rails';
    app.trackStats.guardRailStyle = 'toy-park-large-30pct-smaller-grounded-half-round-rails-straight-road-continuous-sky-blue-bridge-boards-continuous-matching-rails-corner-outer-red-white-inner-gray-with-invisible-containment-lip';
    app.trackStats.guardRailMaterialFeel = '強泥膠感 / rough pitted molded clay-plastic; straight road tile rails are single continuous sky-blue rails, ramp-up/elevated/ramp-down bridge boards have matching continuous half-round side rails, variable-angle bend keeps outer dense red-white and inner smooth gray; 180-degree U-turn tile cancelled';
    app.trackStats.toyParkStraightRailColor = 'sky-blue-matches-straight-track-surface';
    app.trackStats.toyParkBendRailStyle = 'variable-angle-bend-only-length-based-longer-outer-red-white-striped-shorter-inner-one-continuous-smooth-gray-half-round-rails-no-u-turn';
    app.trackStats.toyParkBendOuterRailMaterial = 'red-white-striped';
    app.trackStats.toyParkBendInnerRailMaterial = 'smooth-gray-continuous-one-piece-untextured';
    app.trackStats.toyParkBendInnerRailColor = 'aeb7ba';
    app.trackStats.toyParkBendOuterRoleRule = 'outer-is-the-longer-measured-rail-polyline-not-fixed-left-right';
    app.trackStats.toyParkBendInnerRailSegmentedChunks = false;
    app.trackStats.toyParkBendRailRoleSummary = bendRailRoleSummary;
    app.trackStats.toyParkBendRailRoleCounts = bendRailRoleSummary.reduce((counts, entry) => {
      if (entry.removed) return counts;
      counts[entry.role] = (counts[entry.role] || 0) + 1;
      return counts;
    }, { outer: 0, inner: 0 });
    app.trackStats.toyParkBendRailRemovedRoleCounts = bendRailRoleSummary.reduce((counts, entry) => {
      if (!entry.removed) return counts;
      counts[entry.role] = (counts[entry.role] || 0) + 1;
      return counts;
    }, { outer: 0, inner: 0 });
    app.trackStats.toyParkRailProfile = 'large-30pct-smaller-semi-circular-curb-flat-bottom-upward-grounded';
    app.trackStats.toyParkRailOrientation = 'flat-bottom-down-rounded-half-up-not-inserted-underground';
    app.trackStats.toyParkRailTexture = 'heavy-pitted-molded-plastic-clay-grain';
    app.trackStats.toyParkRailStripeLength = chunkLength;
    app.trackStats.toyParkRailRadius = railRadius;
    app.trackStats.toyParkRailOffset = railOffset;
    app.trackStats.toyParkStandardRailOpening = true;
    app.trackStats.toyParkStandardEntranceWidth = Number(width.toFixed(3));
    app.trackStats.toyParkStandardExitWidth = Number(width.toFixed(3));
    app.trackStats.toyParkStandardRailOpeningWidth = Number((width + railOffset * 2).toFixed(3));
    app.trackStats.toyParkRailWidthFunction = 'constant-width-all-road-tile-entrances-and-exits';
    app.trackStats.toyParkRailBottomLift = railBaseLift;
    app.trackStats.toyParkRailTileConnectorOverlap = tileConnectorOverlap;
    app.trackStats.toyParkRailTileJoinFix = '90-degree-neighbor-board-rails-use-flush-butt-joints-no-blue-connector-caps-no-cross-boundary-overlap; inner-gray-45-degree-seams-still-skip-collars';
    app.trackStats.toyParkRailTileJoinGapExpected = 0;
    app.trackStats.toyParkGroundY = Number((app.groundY ?? 0).toFixed(3));
    app.addPhysicalGuardRails(points, width);
  
}

export function addToyParkFinishBoard(app, finish, finishPrev, finishMat, options = {}) {
    const dx = finish.x - finishPrev.x;
    const dz = finish.z - finishPrev.z;
    const trackTangentYaw = Math.atan2(dx, dz);
    const yaw = Number.isFinite(options.connectorYaw) ? options.connectorYaw : trackTangentYaw;
    // Match the main Toy Park guard-rail opening at the finish transition.
    // `toyParkRailOffset` is already authored in the scaled Toy Park world units;
    // scaling it again pulls the finish side rails inward and makes the finish board
    // read narrower than the adjacent road tile.
    const railOffset = app.trackStats?.toyParkRailOffset ?? 0.392;
    const railRadius = app.trackStats?.toyParkRailRadius ?? 0.784;
    const boardWidth = finish.w ?? app.getTrackWidthAt?.(app.trackLength) ?? app.trackWidth;
    const boardDepth = TOY_PARK_TRACK_TILE_LIBRARY.finish.length ?? 4.8;
    const railDepth = boardDepth;
    // For the loop prototype the final road sample is the start-board entrance seam.
    // Put the checker finish module outside that seam, not on top of the pink start board:
    // local +Z faces the incoming road/start-board entrance, so that edge sits at the
    // finish sample while the rest of the finish tile extends outward before the entrance.
    const boardCenterOffsetFromFinish = -boardDepth / 2;
    const railCenterLocalZ = 0;
    const railChunkLength = app.trackStats?.toyParkRailStripeLength ?? 1.45;
    const railChunkGap = 0.035;
    const makeToyParkFinishCheckerTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      const cell = 64;
      for (let y = 0; y < canvas.height; y += cell) {
        for (let x = 0; x < canvas.width; x += cell) {
          const dark = ((x / cell) + (y / cell)) % 2 === 0;
          ctx.fillStyle = dark ? '#111827' : '#f8fafc';
          ctx.fillRect(x, y, cell, cell);
        }
      }
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      grad.addColorStop(1, 'rgba(15,23,42,0.14)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 380; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 0.5 + Math.random() * 1.7;
        const alpha = 0.025 + Math.random() * 0.06;
        ctx.fillStyle = i % 2 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(3,7,18,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.userData = {
        type: 'toy-park-finish-board-checker-texture',
        pattern: 'black-white-checkerboard-finish-floor',
        materialStyle: 'start-board-style-flat-molded-clay-plastic',
        noFrame: true,
        loopReady: true,
      };
      return texture;
    };
    const group = new THREE.Group();
    group.name = 'TOY_PARK_FINISH_BOARD_MODULE';
    group.position.copy(new THREE.Vector3(
      finish.x + Math.sin(yaw) * boardCenterOffsetFromFinish,
      finish.y + 0.105,
      finish.z + Math.cos(yaw) * boardCenterOffsetFromFinish
    ));
    group.rotation.y = yaw;
    group.userData = {
      type: 'toy-park-finish-board',
      tileKey: TOY_PARK_TRACK_TILE_LIBRARY.finish.key,
      tileLabel: TOY_PARK_TRACK_TILE_LIBRARY.finish.label,
      flatBoard: true,
      noFrame: true,
      sideRails: true,
      separateTileAfterRoad: true,
      notOverlayingRoadTile: true,
      boardCenterOffsetFromFinish: Number(boardCenterOffsetFromFinish.toFixed(3)),
      boardOutsideStartEntrance: true,
      boardEntranceEdgeAtTrackEnd: true,
      connectorAlignment: options.connectorAlignment || 'finish-track-tangent-yaw',
      finishTrackTangentYaw: Number(trackTangentYaw.toFixed(6)),
      boardYaw: Number(yaw.toFixed(6)),
      loopReadyConnector: true,
      physicsPreserved: true,
      style: 'start-board-style-flat-board-with-black-white-checker-floor-side-rails-no-frame-loop-ready',
    };
    const boardMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: makeToyParkFinishCheckerTexture(),
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.52,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    boardMat.userData = {
      type: 'toy-park-finish-board-material',
      opaqueClay: true,
      role: 'black-white-checkerboard-finish-board-start-board-style',
      checkerboardFinishFloor: true,
      podiumRemoved: true,
      noFrame: true,
      loopReady: true,
    };
    const board = new THREE.Mesh(new THREE.BoxGeometry(boardWidth, 0.12, boardDepth), boardMat);
    board.name = 'TOY_PARK_FINISH_BOARD_TILE_FLAT_BLACK_WHITE_CHECKER_NO_FRAME';
    board.position.set(0, 0, 0);
    board.receiveShadow = shadowsEnabled(app);
    board.userData = {
      type: 'toy-park-finish-board-floor',
      flatBoard: true,
      tileKey: TOY_PARK_TRACK_TILE_LIBRARY.finish.key,
      startBoardStyle: true,
      checkerboardFinishFloor: true,
      podiumRemoved: true,
      noFrame: true,
      separateTileAfterRoad: true,
      notOverlayingRoadTile: true,
      boardBackEdgeAtTrackEnd: false,
      boardEntranceEdgeAtTrackEnd: true,
      boardOutsideStartEntrance: true,
      connectorAlignment: options.connectorAlignment || 'finish-track-tangent-yaw',
      finishTrackTangentYaw: Number(trackTangentYaw.toFixed(6)),
      boardYaw: Number(yaw.toFixed(6)),
      boardWidthMatchesTrack: true,
      loopReadyConnector: true,
    };
    group.add(board);

    const sideRailMaterials = createToyParkStartRailPastelMaterialSet(app, finishMat);
    let sideRailChunkCount = 0;
    [-1, 1].forEach((side, sideIndex) => {
      const sideLabel = side < 0 ? 'LEFT' : 'RIGHT';
      const x = side * (boardWidth / 2 + railOffset);
      const chunkCount = Math.max(1, Math.ceil(railDepth / railChunkLength));
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const zStart = -railDepth / 2 + chunkIndex * (railDepth / chunkCount);
        const zEnd = -railDepth / 2 + (chunkIndex + 1) * (railDepth / chunkCount);
        const chunkDepth = Math.max(0.12, (zEnd - zStart) - railChunkGap);
        const frontChunkIndex = (chunkCount - 1) - chunkIndex;
        const railMaterial = sideRailMaterials.materials[(frontChunkIndex + sideIndex * 2) % sideRailMaterials.materials.length];
        const railCenterZ = railCenterLocalZ + (zStart + zEnd) / 2;
        const railSamples = [
          { center: new THREE.Vector3(x, 0.066, railCenterZ - chunkDepth / 2), right: new THREE.Vector3(1, 0, 0), y: 0.066 },
          { center: new THREE.Vector3(x, 0.066, railCenterZ), right: new THREE.Vector3(1, 0, 0), y: 0.066 },
          { center: new THREE.Vector3(x, 0.066, railCenterZ + chunkDepth / 2), right: new THREE.Vector3(1, 0, 0), y: 0.066 },
        ];
        const rail = buildToyParkHalfRoundRailMesh(app, 
          railSamples,
          railRadius,
          railMaterial,
          `TOY_PARK_FINISH_BOARD_SIDE_RAIL_${sideLabel}_${chunkIndex}`,
          {
            type: 'toy-park-finish-board-side-rail',
            finishBoardSideRail: true,
            matchesStartBoardSideRailStyle: true,
            matchesTrackRailSize: true,
            noFrame: true,
            side: sideLabel.toLowerCase(),
            railSide: side,
            curveRole: 'pastel-finish-side-rail-loop-connector',
            chunkIndex,
            railRadius,
            railHeight: railRadius,
            railThickness: railRadius * 2,
            railOffset,
            railChunkLength,
            railDepth: Number(railDepth.toFixed(3)),
            railCenterLocalZ,
            railFrontLocalZ: Number((railCenterLocalZ + railDepth / 2).toFixed(3)),
            railBackLocalZ: Number((railCenterLocalZ - railDepth / 2).toFixed(3)),
            railFrontFlushWithBoard: true,
            railBackFlushWithBoard: true,
            loopReadyConnector: true,
            paletteKey: railMaterial.userData?.paletteKey || null,
            paletteFamily: railMaterial.userData?.paletteFamily || null,
            paletteIndex: railMaterial.userData?.paletteIndex ?? null,
            railProfile: 'same-size-as-start-board-half-round-side-rail-flat-bottom-upward',
          }
        );
        group.add(rail);
        sideRailChunkCount += 1;
      }
      const body = new CANNON.Body({ mass: 0, material: app.railMaterial || app.obstacleMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(railRadius, railRadius / 2, railDepth / 2)));
      body.position.copy(group.position.clone().add(app.localToWorldOffset(x, railRadius / 2 + 0.066, railCenterLocalZ, yaw)));
      body.quaternion.setFromEuler(0, yaw, 0, 'YXZ');
      body.userData = {
        name: `TOY_PARK_FINISH_BOARD_SIDE_RAIL_BODY_${sideLabel}`,
        finishSideRailBody: true,
        loopReadyConnector: true,
        noFrame: true,
        railDepth,
        railCenterLocalZ,
      };
      app.world.addBody(body);
      app.trackBodies.push(body);
    });

    app.trackGroup.add(group);
    app.trackStats.toyParkFinishBoard = {
      tileKey: TOY_PARK_TRACK_TILE_LIBRARY.finish.key,
      label: TOY_PARK_TRACK_TILE_LIBRARY.finish.label,
      flatBoard: true,
      boardWidth: Number(boardWidth.toFixed(3)),
      trackWidth: Number((finish.w ?? app.trackWidth).toFixed(3)),
      boardWidthMatchesTrack: true,
      boardIncludesRailFootprint: false,
      separateTileAfterRoad: true,
      notOverlayingRoadTile: true,
      boardBackEdgeAtTrackEnd: false,
      boardEntranceEdgeAtTrackEnd: true,
      boardOutsideStartEntrance: true,
      connectorAlignment: options.connectorAlignment || 'finish-track-tangent-yaw',
      finishTrackTangentYaw: Number(trackTangentYaw.toFixed(6)),
      boardYaw: Number(yaw.toFixed(6)),
      boardCenterOffsetFromFinish: Number(boardCenterOffsetFromFinish.toFixed(3)),
      boardStartsAtDistance: Number((app.trackLength - boardDepth).toFixed(3)),
      boardEndsAtDistance: Number(app.trackLength.toFixed(3)),
      noFrame: true,
      sideRails: true,
      sideRailChunkCount,
      sideRailStyle: 'start-board-matching-pastel-half-round-left-right-rails',
      sideRailRadius: railRadius,
      sideRailOffset: railOffset,
      standardRailOpening: true,
      standardEntranceWidth: Number(boardWidth.toFixed(3)),
      standardExitWidth: Number(boardWidth.toFixed(3)),
      railOpeningWidth: Number((boardWidth + railOffset * 2).toFixed(3)),
      sideRailDepth: railDepth,
      railFrontFlushWithBoard: true,
      railBackFlushWithBoard: true,
      loopReadyConnector: true,
      futureLoopConnection: 'finish-board-can-connect-to-start-board-for-loop-course',
      boardDepth,
      finishLineEmbedded: false,
      checkerboardFinishFloor: true,
      floorTexture: 'black-white-checkerboard-finish-floor',
      style: 'start-board-style-flat-board-with-black-white-checker-floor-side-rails-no-frame-loop-ready',
      podiumRemoved: true,
      finishCollectorRemoved: true,
      finalAwardStageRemoved: true,
      rankingSlotVisualsRemoved: true,
      finishBoardOnly: true,
      physicsPreserved: true,
    };
  
}

