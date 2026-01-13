import { useBlockProps, InnerBlocks } from '@wordpress/block-editor';

export default function save({ attributes }) {
    // Check if user provided an aspect ratio
    const hasRatio = attributes.customAspectRatio && attributes.customAspectRatio.trim() !== "";
    const ratio = hasRatio ? parseFloat(attributes.customAspectRatio) : 0;

    const blockProps = useBlockProps.save({
        className: 'shoreline-physics-block-container',
        style: {
            width: '100%',
            position: 'relative',
            // If Valid Ratio: Enforce Aspect Ratio. If Null/Empty: Let content drive height.
            aspectRatio: hasRatio && ratio > 0 ? `${1 / ratio}` : undefined,
            overflow: 'hidden'
        }
    });

    // Pass attributes to view script via data attributes on the canvas
    const canvasData = {
        customAspectRatio: hasRatio ? attributes.customAspectRatio : null, // Pass null if auto
        consistentStroke: attributes.consistentStroke,
        resolutionStep: attributes.resolutionStep,
        groupMin: attributes.groupMin,
        groupMax: attributes.groupMax,
        groupSpread: attributes.groupSpread,
        occlusionMode: attributes.occlusionMode,
        occlusionReverse: attributes.occlusionReverse,
        occlusionStrength: attributes.occlusionStrength,
        frontLineOpacity: attributes.frontLineOpacity,
        waveSpeed: attributes.waveSpeed,
        waveDistance: attributes.waveDistance,
        roughness: attributes.roughness,
        waveAmplitude: attributes.waveAmplitude,
        bendSpeed: attributes.bendSpeed,
        direction: attributes.direction,
        detailAmp: attributes.detailAmp,
        detailSpeed: attributes.detailSpeed,
        detailSpread: attributes.detailSpread,
        sandDensity: attributes.sandDensity,
        sandHeight: attributes.sandHeight,
        sandPower: attributes.sandPower,
        sandColor: attributes.sandColor,
        strokeWidth: attributes.strokeWidth,
        waveScale: attributes.waveScale,
        fillEnabled: attributes.fillEnabled,
        fillColor: attributes.fillColor,
        fillRandomMode: attributes.fillRandomMode,
        fillOpacity: attributes.fillOpacity,
        fillOpacityDecay: attributes.fillOpacityDecay,
        fillIgnoreOcclusion: attributes.fillIgnoreOcclusion,
        fillSolid: attributes.fillSolid,
        fillColorMode: attributes.fillColorMode,
        fillGradientType: attributes.fillGradientType
    };

    return (
        <div {...blockProps}>
            <canvas
                className="shoreline-background-canvas-view"
                data-settings={JSON.stringify(canvasData)}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 0,
                    objectFit: 'cover'
                }}
            />
            <div className="shoreline-content-wrapper" style={{
                position: hasRatio ? 'absolute' : 'relative', // Relative creates height if no aspect ratio
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 1
            }}>
                <InnerBlocks.Content />
            </div>
        </div>
    );
}
