import { FunctionToolOutput } from "../context";
import { TOOL_RUNTIME_UNAVAILABLE } from "./mod";

export async function run_unified_exec_runtime(): Promise<FunctionToolOutput> {
	return FunctionToolOutput.fromText(TOOL_RUNTIME_UNAVAILABLE, false);
}
