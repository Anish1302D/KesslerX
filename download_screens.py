import os
import json
import subprocess

workspace = r"C:\Users\anish\Desktop\KesslerX\stitch_screens"
os.makedirs(workspace, exist_ok=True)

screens = [
    {
        "id": "564c95619e7543978f9f38710dc3ae1f",
        "title": "AI Copilot Hub",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLuPMj7ttH1yUUAZ9ppg8_rCZBm8eKmVWI8sk03xKGN-hqdc1483DKeCWAf-qC3FUzXJQ_br580OSFBA4WEqRWP5SItki_IvxGegc2nQPNYSDbih5MR_uC94RsInLEIYV1KCKaNux0yBiyX8PPL37n38mlmAkNU3lWtxsaIiPwhr2glztnyJ4zTF4u2kYMwB96yXz11YaQM7-3cjMz4SkllEOgDHQZWgRytXJQrzhWZ_o7WNpS6I45JPwOk",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzY4ZDMxNDMzNjU5MDRiY2ZiZGQwMzcxNWI1ZWMwZGIzEgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    },
    {
        "id": "72a9a57206774274b1231ece33149012",
        "title": "Orbital Analytics",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLvfkN8aHnGntgnFJdEqJuJzmz23XFg8BBMfNkvxG35BQ30rLyUHTOiGhJGQOiT_WTQ70j08UHOTeM706w7Cbv_MPNJwkb0xo_OUGnTiV4VaySap_6d4ePSLl-PJ_jM_fIWsJPId0qoz6MV5yqLsDprHdbPVoMPYBxTEr6t4mDmq1ddkOIg2CvraNuhqj5lhSNR_b4pMV6VN2VWP5BNJEzyg_BvJ2rhTI1ltk-5zBE1zlvQD03gc2S5k6Bc",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzU0M2ZjN2VlYTI3NjRiMzE4MDIwMDI3NDliYmM5Nzg5EgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    },
    {
        "id": "42931f07e9fb4398ab5f3c906dfd836a",
        "title": "KesslerX Dashboard",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLtlhjWMQrGDAgvgSHD93E-_3koF0UHZeiLNpIQy-JnI7_S7FHp8t4RWIRzQHaPiJaTMyImNajB1J29FRJHImhFAt0EpZPkRItFrQVbIsTb9pm7mHsXZTSDhwpAWAr1zQgiZYAAGmN1BqJ6NIPbrOw8W2Gtzw9aJPT8p5Iwg3VcX0SSpj2bMQp4jQs_yEPQdOQzcNSVssrbE4mTShEYOWAyX7iISLjV7JEAQFySw3YiwNQDgD6CUB2yt9mM",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2JiYmM0MDE2ZmZiMDRjYmNiZjFmMzgyZmE0ZTZmMWMyEgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    },
    {
        "id": "b0b4e062e2e445dfb40ed0fb382b4ff6",
        "title": "Space Weather Station",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLu0q652tRMMnLOtqs1OQnU15kapoQcG29PXpP3zXuRQz2hzkJDAOHObV7bOT5f0iCXc8ss9tkP18QDI9X0PLGk4wR3tEXFLKIssCv1hHk7QKgRJpQdsvd-1cwjpiwPRINAPh1SuXkrvZAg9jwnyn5saOcK3bg8FYX1dtAVEXn8A8eqRxLjD4-cNhUjgo_n6XY3HA3K4ZRWswhePxtRzxWjMok7RGHDKqyrENACSEGSujBrfr64I-QKwhw",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2MzNTJlZDQ0N2Y0ZTRiMWE5ZDczOTk1MjgzYTQ4NjQ0EgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    },
    {
        "id": "2b1196544e5d461d9b1b1066eec21e53",
        "title": "Collision Monitor",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLszzIuLwpni6YMqzEXLccrkbwGdho8DmJ-4dudA1seoiRJeH_IrpuOtXPNWzC-4mIjuu98YfxUwBs06pTUaVJtru-8aQ60SoMM8R5Gx1cEa3P2Sr7lz2uL4pIjWZB1yPvXyelHcotDPQNMNyR-jkiPpE85tZVnJvK_27tWOQn_nJZiX0y5ox7zoT_pXEw37jTzqUsegFYZVav9FDLLFamlrJb4kBO0lI8IUXRrQ6FWYCf3lqiTJNgz60co",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzQ3ZGIyNDc1Mjk2NTQwYWM4YzVkNjliMjQ1Y2I0ZjE2EgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    },
    {
        "id": "4f0efccdc4fd48748d4c422fd667c328",
        "title": "Mission Reports & Documentation",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLu__XtWQXsv8x5e0ciFD5XaEQvSopEQpRS-SQSi_4bjX6CsGyucRyptOLS5H9m69paDCUsFeX_MJheLTAjmzcRBgbk95xM8CTIMjAco38T6EVThKyKDxAXRzO5CpaHckkPJqDlmDyBaSuMfAi-y0p--N6AX_9y4d78fTDV1UJDXVkNVKwT71eHViA1tAXzslrKsVx3xbLYa18su8_4AUaZ8Ie5T87AXn0sdcyjqNgsm88YtExfnZIq_0pQ",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzVlNmQ3OTYxMDZjMTRlMTZiODdlNGY0YmE2ODQwODk2EgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    },
    {
        "id": "1eb69bd28b904229989b5dfce3420ea1",
        "title": "System Settings",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLvOmkOg6qRB_mIT1HhLuD4vU-kUQVATS7F55ekwiISqoM2ts5PemtNFklz1r9af2npG-kbUfN9KSlOfU7MOZe8G6CxzqMP0ksh8IcMajyCHIfCVTugC9iW4fEYRS5t6gf7zeVdcPPFnLIFYBajtcx2lQ4_W1Z5HW3mzrR99BH70aBHoqbDItkzj7VfjNzYQB74eW8bMPvRcf-RnFiSGzzIQYIK6kGz8iWqG8k7QnZN-c-sY3Zv0Vuoke3A",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2U1NzljMmM2ODk1MDRiNzRhNGQ5MjQ1MmQwYzM3MjYzEgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    },
    {
        "id": "2027573750472399079",
        "title": "ChatGPT Image",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLuWCTtWmlh2-7gNpEB0iTHIRXE_u31vTz26-Qowr5VP2wg6ZF3W3_etieFazbLpyZlYX2IUhRIk7XwjYCmQdmgYqg0jI012QK8mc6bsHpsMyib-6MdD26JdOFQFY4cYjuMdyU86SxGW8eKezTxsoHqd20EIGhoms69akaqR2Qirh2-aOkM7MvoLfjipvpZS9MrzdKaLBkautt4HG8ipgt7ylwFKteH10BTmXp7aLAR4mouw3hbLfCQnUC48msYsqXAwiStsNqYLrQ",
        "html": None
    },
    {
        "id": "72ec4bc5d48a46c2b0627f170a7c15e2",
        "title": "Interactive Orbital Map",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLuhxH6bVj0H5mvBMlLN5c_EXQ2OLL0zoQ8t-WPl3yQHM8W98jEtM7PzP0JbKq-s2J6dBC_Ofgl-U2TvvOJGm0CNsYHZ8o_VMvKPw8hdf5_Vyr_B0gmnrTfdZQCfhczKWISLtxYTmuBuo1t5jQsQEwgUMuU_kK-tBHKXINXzEPgFG16IyLZewzhp2xe8uK-Lz1n5_43kd2OuAo-5eNmhYUVV2IxmHASdshxpwafQhSenLSD9GCLs90dmgg",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2Y0ZjkwOWQ1YTkwYTRiNjU4OGJkMDNjNGE0YWMxMjY1EgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    },
    {
        "id": "4dfed890e25e45b0a7f5a3c1003987c2",
        "title": "Alert Center",
        "img": "https://lh3.googleusercontent.com/aida/AP1WRLtthYS6WAg1XJEXaBYP-ORafjULjaItE_BGgMAYXzmSnwUblB8SwQXb3Ne8NSFaal17wjE1tRIDeOxdIUibLILI-l6EnDVNq-QNQofCoJRWtyWtxREyfspe36hDGZvZStVVcKEkexKh2_Z0aKseNHGxXxQdenkw8B9yGZ95fS7Dth1Ur7RQI4Aj3gor7x0VM0Bv1_45s5K6l9t31gAGkQS1wkIq84FO7mNf35kZbjJBDTsfO1VcDxr-obU",
        "html": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzczNDljOTk5OWE0NzQ4Y2U5ZTdmYmVhNzdkMjY3OTFjEgsSBxD68t7W4RkYAZIBIwoKcHJvamVjdF9pZBIVQhM3MTMzNDY3OTg5ODIzMDgxOTcx&filename=&opi=89354086"
    }
]

for idx, screen in enumerate(screens):
    title = screen["title"].replace(" ", "_").replace("&", "and")
    if screen["img"]:
        img_path = os.path.join(workspace, f"{idx+1}_{title}.png")
        print(f"Downloading {img_path}")
        subprocess.run(["curl", "-L", screen["img"], "-o", img_path])
    
    if screen["html"]:
        html_path = os.path.join(workspace, f"{idx+1}_{title}.html")
        print(f"Downloading {html_path}")
        subprocess.run(["curl", "-L", screen["html"], "-o", html_path])

# Now fetch the design system from the output.txt
try:
    with open("C:/Users/anish/.gemini/antigravity-ide/brain/85639838-c7e4-4da3-bf17-6bbeb73d4b44/.system_generated/steps/5/output.txt", "r", encoding="utf-8") as f:
        data = json.load(f)
        for p in data.get("projects", []):
            if p.get("name") == "projects/7133467989823081971":
                design_md = p.get("designTheme", {}).get("designMd", "")
                if design_md:
                    with open(os.path.join(workspace, "design_system.md"), "w", encoding="utf-8") as out:
                        out.write(design_md)
                    print("Saved design system markdown.")
except Exception as e:
    print(f"Failed to extract design system: {e}")

