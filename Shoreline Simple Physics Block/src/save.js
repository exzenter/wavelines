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
    // Use defensive defaults to prevent undefined values from breaking block validation
    const canvasData = {
        customAspectRatio: hasRatio ? attributes.customAspectRatio : null, // Pass null if auto
        consistentStroke: attributes.consistentStroke ?? false,
        resolutionStep: attributes.resolutionStep ?? 10,
        groupMin: attributes.groupMin ?? 3,
        groupMax: attributes.groupMax ?? 6,
        groupSpread: attributes.groupSpread ?? 40,
        occlusionMode: attributes.occlusionMode ?? true,
        occlusionReverse: attributes.occlusionReverse ?? false,
        occlusionStrength: attributes.occlusionStrength ?? 80,
        frontLineOpacity: attributes.frontLineOpacity ?? 100,
        waveSpeed: attributes.waveSpeed ?? 0.5,
        waveDistance: attributes.waveDistance ?? 120,
        roughness: attributes.roughness ?? 0,
        waveAmplitude: attributes.waveAmplitude ?? 120,
        bendSpeed: attributes.bendSpeed ?? 0.1,
        direction: attributes.direction ?? 0,
        detailAmp: attributes.detailAmp ?? 15,
        detailSpeed: attributes.detailSpeed ?? 0.2,
        detailSpread: attributes.detailSpread ?? 100,
        sandDensity: attributes.sandDensity ?? 0,
        sandHeight: attributes.sandHeight ?? 300,
        sandPower: attributes.sandPower ?? 3,
        sandColor: attributes.sandColor ?? '#111111',
        strokeWidth: attributes.strokeWidth ?? 2,
        waveScale: attributes.waveScale ?? 1,
        fillEnabled: attributes.fillEnabled ?? false,
        fillColor: attributes.fillColor ?? '#3498db',
        fillRandomMode: attributes.fillRandomMode ?? false,
        fillOpacity: attributes.fillOpacity ?? 80,
        fillOpacityDecay: attributes.fillOpacityDecay ?? 15,
        fillIgnoreOcclusion: attributes.fillIgnoreOcclusion ?? false,
        fillSolid: attributes.fillSolid ?? false,
        fillColorMode: attributes.fillColorMode ?? 'single',
        fillGradientType: attributes.fillGradientType ?? 'transparent'
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
