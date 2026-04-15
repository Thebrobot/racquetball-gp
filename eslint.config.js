import js from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
	{
		ignores: ['dist/**', '.astro/**', 'node_modules/**'],
	},
	{
		files: ['public/**/*.js'],
		languageOptions: {
			globals: globals.browser,
		},
		rules: {
			// Referenced from inline HTML `onclick` attributes
			'no-unused-vars': [
				'error',
				{
					varsIgnorePattern: '^(setLbTab|renderLb)$',
					argsIgnorePattern: '^_',
				},
			],
		},
	},
	js.configs.recommended,
	{
		files: ['astro.config.mjs', 'eslint.config.js'],
		languageOptions: {
			globals: globals.nodeBuiltin,
		},
	},
	...eslintPluginAstro.configs.recommended,
];
