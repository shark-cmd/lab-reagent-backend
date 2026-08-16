# ----------------------- Auth routes -----------------------
@api.post("/auth/login")
async def login(req: LoginReq):
    user = await db.users.find_one({"username": req.username.strip().lower()})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("pin_hash") and req.pin is not None and req.pin != "":
        if not verify_password(req.pin, user["pin_hash"]):
            raise HTTPException(status_code=401, detail="Invalid PIN")
    token = make_token(user)
    return {"token": token, "user": {"id": user["id"], "username": user["username"],
            "name": user.get("name"), "role": user.get("role", "technician")}}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ----------------------- User management (admin) -----------------------
@api.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "pin_hash": 0}).to_list(1000)
    return users


@api.post("/users")
async def create_user(req: UserCreate, admin: dict = Depends(require_admin)):
    uname = req.username.strip().lower()
    if await db.users.find_one({"username": uname}):
        raise HTTPException(status_code=400, detail="Username already exists")
    doc = {
        "id": new_id(), "username": uname, "name": req.name,
        "password_hash": hash_password(req.password),
        "pin_hash": hash_password(req.pin) if req.pin else "",
        "role": req.role, "active": True, "created_at": now_iso(),
    }
    await db.users.insert_one(dict(doc))
    return {"id": doc["id"], "username": uname, "name": req.name, "role": req.role, "active": True}


@api.put("/users/{user_id}")
async def update_user(user_id: str, req: UserUpdate, admin: dict = Depends(require_admin)):
    upd = {}
    if req.name is not None:
        upd["name"] = req.name
    if req.role is not None:
        upd["role"] = req.role
    if req.active is not None:
        upd["active"] = req.active
    if req.password:
        upd["password_hash"] = hash_password(req.password)
    if req.pin:
        upd["pin_hash"] = hash_password(req.pin)
    if not upd:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.users.update_one({"id": user_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ----------------------- Inventory routes -----------------------
@api.post("/resolve")
async def resolve(req: ResolveReq, user: dict = Depends(get_current_user)):
    barcode = req.barcode.strip()
    if barcode.upper().startswith("LOC:"):
        return {"type": "location", "location": barcode[4:].replace("_", " ").strip(), "raw": barcode}
    item = await db.items.find_one({"barcode": barcode}, {"_id": 0})
    if not item:
        return {"type": "item", "found": False, "barcode": barcode}
    lots = await db.lots.find({"item_id": item["id"]}, {"_id": 0}).to_list(10000)
    lots.sort(key=lambda l: expiry_sort_key(l.get("expiry", "")))
    total = sum(l.get("qty", 0) for l in lots)
    return {"type": "item", "found": True, "item": item, "lots": lots, "total": total}


@api.post("/stock-in")
async def stock_in_route(req: StockInReq, user: dict = Depends(get_current_user)):
    return await do_stock_in(req, technician=user["name"])


@api.post("/receive-commit")
async def receive_commit(req: ReceiveCommitReq, user: dict = Depends(get_current_user)):
    imported = 0
    registered = 0
    errors = []
    for idx, it in enumerate(req.items, start=1):
        try:
            if not (it.barcode or "").strip():
                errors.append(f"Row {idx}: missing barcode")
                continue
            r = await do_stock_in(StockInReq(**it.model_dump()), technician=user["name"])
            imported += 1
            if r.get("registered"):
                registered += 1
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    return {"ok": True, "imported": imported, "registered": registered,
            "count": imported, "errors": errors}


@api.post("/use")
async def use_route(req: UseReq, user: dict = Depends(get_current_user)):
    res = await do_stock_out(req.barcode.strip(), req.qty, technician=user["name"], action="use")
    if res.get("error") == "unknown_barcode":
        raise HTTPException(status_code=404, detail="Barcode not registered")
    return res


@api.post("/stocktake")
async def stocktake_route(req: StocktakeReq, user: dict = Depends(get_current_user)):
    item = await db.items.find_one({"barcode": req.barcode.strip()})
    if not item:
        raise HTTPException(status_code=404, detail="Barcode not registered")
    item_id = item["id"]
    current = await item_total(item_id)
    diff = req.counted - current
    if diff > 0:
        existing = await db.lots.find_one({"item_id": item_id, "lot": "STOCKTAKE", "expiry": ""})
        if existing:
            await db.lots.update_one({"_id": existing["_id"]}, {"$inc": {"qty": diff}})
        else:
            await db.lots.insert_one({"id": new_id(), "item_id": item_id, "lot": "STOCKTAKE", "expiry": "", "qty": diff})
    elif diff < 0:
        await do_stock_out(req.barcode.strip(), -diff, technician=user["name"], action="adjust_out")
    if req.location:
        await db.items.update_one({"id": item_id}, {"$set": {"location": req.location}})
    await log_action("adjust", item_id, diff, technician=user["name"],
                     detail=f"stocktake counted={req.counted} was={current}")
    new_total = await item_total(item_id)
    return {"ok": True, "counted": req.counted, "previous": current, "adjustment": diff, "total": new_total,
            "item_name": item.get("name")}


@api.post("/move")
async def move_route(req: MoveReq, user: dict = Depends(get_current_user)):
    item = await db.items.find_one({"barcode": req.barcode.strip()})
    if not item:
        raise HTTPException(status_code=404, detail="Barcode not registered")
    loc = req.location.strip()
    if loc.upper().startswith("LOC:"):
        loc = loc[4:].replace("_", " ").strip()
    prev = item.get("location", "")
    await db.items.update_one({"id": item["id"]}, {"$set": {"location": loc}})
    await log_action("move", item["id"], 0, technician=user["name"],
                     detail=f"{prev or 'unset'} -> {loc}")
    return {"ok": True, "location": loc, "item_name": item.get("name")}


@api.post("/item-update")
async def item_update(req: ItemUpdateReq, user: dict = Depends(get_current_user)):
    upd = {}
    for f in ["name", "unit", "min_stock", "location", "storage", "cost"]:
        v = getattr(req, f)
        if v is not None:
            upd[f] = v
    if not upd:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.items.update_one({"id": req.id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    await log_action("edit", req.id, 0, technician=user["name"], detail=f"updated {list(upd.keys())}")
    return {"ok": True}


@api.delete("/items/{item_id}")
async def delete_item(item_id: str, admin: dict = Depends(require_admin)):
    item = await db.items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.lots.delete_many({"item_id": item_id})
    await db.items.delete_one({"id": item_id})
    await log_action("delete", item_id, 0, technician=admin["name"], detail=f"deleted {item.get('name')}")
    return {"ok": True}


