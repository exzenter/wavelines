<?php
/**
 * Plugin Name:       Shoreline Simple Physics Block
 * Description:       A custom Gutenberg block that renders the Shoreline Simple Physics animation as a background for nested content.
 * Version:           1.0.0
 * Author:            Antigravity
 * Text Domain:       shoreline-simple-physics-block
 */

function shoreline_simple_physics_block_init() {
	register_block_type( __DIR__ . '/build' );
	
	// Register worker script URL for frontend use
	// The worker is loaded dynamically by view.js, but we register it so the URL is available
	wp_register_script(
		'shoreline-wave-worker',
		plugins_url( 'build/wave-worker.js', __FILE__ ),
		array(),
		'1.0.0',
		true
	);
}
add_action( 'init', 'shoreline_simple_physics_block_init' );

// Add worker URL to the page so view.js can find it
function shoreline_add_worker_url() {
	$worker_url = plugins_url( 'build/wave-worker.js', __FILE__ );
	echo '<script>window.shorelineWorkerUrl = "' . esc_url($worker_url) . '";</script>';
}
add_action( 'wp_head', 'shoreline_add_worker_url' );

