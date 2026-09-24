from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from app.agent.state import AgentState
from app.agent.nodes import (
    analyze_question,
    retrieve_schema_node,
    generate_sql,
    validate_sql_node,
    repair_sql,
    execute_sql_node,
    process_result,
    generate_answer,
    validation_route,
    execute_error_or_success,
)


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("analyze_question", analyze_question)
    graph.add_node("retrieve_schema", retrieve_schema_node)
    graph.add_node("generate_sql", generate_sql)
    graph.add_node("validate_sql", validate_sql_node)
    graph.add_node("repair_sql", repair_sql)
    graph.add_node("execute_sql", execute_sql_node)
    graph.add_node("process_result", process_result)
    graph.add_node("generate_answer", generate_answer)

    graph.add_edge(START, "analyze_question")
    graph.add_edge("analyze_question", "retrieve_schema")
    graph.add_edge("retrieve_schema", "generate_sql")
    graph.add_edge("generate_sql", "validate_sql")

    graph.add_conditional_edges(
        "validate_sql",
        validation_route,
        {
            "execute_sql": "execute_sql",
            "repair_sql": "repair_sql",
        },
    )

    graph.add_edge("repair_sql", "validate_sql")

    graph.add_conditional_edges(
        "execute_sql",
        execute_error_or_success,
        {
            "repair": "repair_sql",
            "process_result": "process_result",
        },
    )

    graph.add_edge("process_result", "generate_answer")
    graph.add_edge("generate_answer", END)

    return graph.compile(checkpointer=MemorySaver())


agent_graph = build_graph()
