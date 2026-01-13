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
}
add_action( 'init', 'shoreline_simple_physics_block_init' );
