declare module "js-yaml" {
	interface Schema {
		readonly name: string;
	}

	interface LoadOptions {
		schema?: Schema;
		json?: boolean;
		onWarning?: (warning: Error) => void;
		filename?: string;
	}

	export const FAILSAFE_SCHEMA: Schema;
	export const JSON_SCHEMA: Schema;
	export const CORE_SCHEMA: Schema;
	export const DEFAULT_SCHEMA: Schema;

	export function load(yaml: string, options?: LoadOptions): unknown;

	const yaml: {
		load: typeof load;
		FAILSAFE_SCHEMA: Schema;
		JSON_SCHEMA: Schema;
		CORE_SCHEMA: Schema;
		DEFAULT_SCHEMA: Schema;
	};

	export default yaml;
}
