from pathlib import Path


ROOT = Path(__file__).parent
APP_DIR = ROOT / "app_static" / "griglia-pcp"


def read_asset(name: str) -> str:
    return (APP_DIR / name).read_text(encoding="utf-8")


def build_app_html() -> str:
    html = read_asset("index.html")
    css = read_asset("styles.css")
    js = read_asset("app.js")

    html = html.replace(
        '<link rel="stylesheet" href="styles.css" />',
        f"<style>\n{css}\n</style>",
    )
    html = html.replace(
        '<script src="app.js"></script>',
        f"<script>\n{js}\n</script>",
    )
    return html


def main() -> None:
    import streamlit as st
    import streamlit.components.v1 as components

    st.set_page_config(
        page_title="Griglia PCP",
        page_icon="▦",
        layout="wide",
        initial_sidebar_state="collapsed",
    )

    st.markdown(
        """
        <style>
          .block-container {
            padding: 0;
            max-width: 100%;
          }

          header[data-testid="stHeader"] {
            display: none;
          }

          iframe {
            border: 0;
          }
        </style>
        """,
        unsafe_allow_html=True,
    )

    components.html(build_app_html(), height=1850, scrolling=True)


if __name__ == "__main__":
    main()
