from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from app.agent.state import AgentState
from app.agent.nodes import (
    analyze_question,
    query_planner,
    retrieve_schema_node,
    validate_plan,
    generate_sql,
    validate_sql_node,
    repair_sql,
    repair_plan,
    execute_sql_node,
    verify_result,
    process_result,
    generate_answer,
    plan_route,
    validation_route,
    execute_error_or_success,
    verification_route,
)


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("analyze_question", analyze_question)
    graph.add_node("query_planner", query_planner)
    graph.add_node("retrieve_schema", retrieve_schema_node)
    graph.add_node("validate_plan", validate_plan)
    graph.add_node("generate_sql", generate_sql)
    graph.add_node("validate_sql", validate_sql_node)
    graph.add_node("repair_sql", repair_sql)
    graph.add_node("repair_plan", repair_plan)
    graph.add_node("execute_sql", execute_sql_node)
    graph.add_node("verify_result", verify_result)
    graph.add_node("process_result", process_result)
    graph.add_node("generate_answer", generate_answer)

    graph.add_edge(START, "analyze_question")
    graph.add_edge("analyze_question", "query_planner")
    graph.add_edge("query_planner", "retrieve_schema")
    graph.add_edge("retrieve_schema", "validate_plan")
    graph.add_conditional_edges(
        "validate_plan",
        plan_route,
        {
            "generate_sql": "generate_sql",
            "repair_plan": "repair_plan",
            "process_result": "process_result",
        },
    )
    graph.add_edge("repair_plan", "validate_plan")
    graph.add_edge("generate_sql", "validate_sql")

    graph.add_conditional_edges(
        "validate_sql",
        validation_route,
        {
            "execute_sql": "execute_sql",
            "repair_sql": "repair_sql",
            "process_result": "process_result",
        },
    )

    graph.add_edge("repair_sql", "validate_sql")

    graph.add_conditional_edges(
        "execute_sql",
        execute_error_or_success,
        {
            "repair": "repair_sql",
            "process_result": "verify_result",
        },
    )

    graph.add_conditional_edges(
        "verify_result",
        verification_route,
        {
            "repair_sql": "repair_sql",
            "repair_plan": "repair_plan",
            "process_result": "process_result",
        },
    )

    graph.add_edge("process_result", "generate_answer")
    graph.add_edge("generate_answer", END)

    return graph.compile(checkpointer=MemorySaver())


agent_graph = build_graph()
