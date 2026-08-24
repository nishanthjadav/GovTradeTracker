@echo off
schtasks /change /tn "Daily Scrape" /tr "C:/SAPDevelop/SideProjects/GovTradeTracker/run_house_daily.bat" /rp *
