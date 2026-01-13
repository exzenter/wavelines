import { registerBlockType } from '@wordpress/blocks';
import './style.scss';
import Edit from './edit';
import save from './save';
import metadata from './block.json';

registerBlockType(metadata.name, {
    edit: Edit,
    save,
    icon: <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2,18 C5,18 5,14 8,14 C11,14 11,18 14,18 C17,18 17,14 20,14 C23,14 23,18 26,18" stroke="currentColor" fill="none" strokeWidth="1.5" /><path d="M2,14 C5,14 5,10 8,10 C11,10 11,14 14,14 C17,14 17,10 20,10 C23,10 23,14 26,14" stroke="currentColor" fill="none" strokeWidth="1.5" /><path d="M2,10 C5,10 5,6 8,6 C11,6 11,10 14,10 C17,10 17,6 20,6 C23,6 23,10 26,10" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>,
});
