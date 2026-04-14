/** Base interface for tool search matches */
export interface BaseMatch {
	server: string;
	tool: string;
	description: string;
	score: number;
}
